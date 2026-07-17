-- ============================================
-- SQL SETUP UNTUK SISTEM PAYROLL
-- ============================================
-- 
-- Jalankan script ini di Supabase SQL Editor
-- untuk membuat tabel dan policies yang dibutuhkan
--

-- ============================================
-- 1. BUAT TABEL pengajuan_gaji (TABEL BARU)
-- ============================================

CREATE TABLE IF NOT EXISTS pengajuan_gaji (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    periode_id TEXT NOT NULL,
    snapshot_id BIGINT REFERENCES payroll_snapshots(id),
    nominal_gaji NUMERIC NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'menunggu_admin'
        CHECK (status IN ('belum_mengajukan', 'menunggu_admin', 'disetujui', 'ditolak', 'sudah_diambil')),
    rekening_tujuan TEXT,
    alasan_penolakan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID,
    paid_at TIMESTAMP WITH TIME ZONE,
    paid_by UUID,
    CONSTRAINT unique_user_periode UNIQUE(user_id, periode_id),
    CONSTRAINT valid_nominal CHECK (nominal_gaji >= 0)
);

-- ============================================
-- 2. BUAT INDEX UNTUK PERFORMA
-- ============================================

CREATE INDEX idx_pengajuan_gaji_user 
    ON pengajuan_gaji(user_id);

CREATE INDEX idx_pengajuan_gaji_status 
    ON pengajuan_gaji(status);

CREATE INDEX idx_pengajuan_gaji_periode 
    ON pengajuan_gaji(periode_id);

CREATE INDEX idx_pengajuan_gaji_created_at 
    ON pengajuan_gaji(created_at DESC);

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE pengajuan_gaji ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. BUAT POLICIES UNTUK RLS
-- ============================================

-- Policy 1: User hanya bisa lihat pengajuan milik sendiri
CREATE POLICY "Users can view own requests"
    ON pengajuan_gaji
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy 2: User hanya bisa insert pengajuan untuk dirinya sendiri
CREATE POLICY "Users can only insert own requests"
    ON pengajuan_gaji
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy 3: Admin bisa update status (sesuaikan dengan role Anda)
-- NOTE: Sesuaikan logic ini dengan sistem role/permission Anda
CREATE POLICY "Admins can update request status"
    ON pengajuan_gaji
    FOR UPDATE
    USING (
        -- Jika punya role admin dari users table
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Policy 4: Admin bisa select semua data (untuk admin panel)
CREATE POLICY "Admins can view all requests"
    ON pengajuan_gaji
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
        )
    );

-- ============================================
-- 5. BUAT TRIGGER UNTUK AUDIT
-- ============================================

-- Buat tabel audit log (optional tapi recommended)
CREATE TABLE IF NOT EXISTS pengajuan_gaji_audit (
    id BIGSERIAL PRIMARY KEY,
    pengajuan_id BIGINT NOT NULL REFERENCES pengajuan_gaji(id),
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function untuk log perubahan
CREATE OR REPLACE FUNCTION log_pengajuan_gaji_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO pengajuan_gaji_audit (
        pengajuan_id, 
        action, 
        old_data, 
        new_data, 
        changed_by
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        auth.uid()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger untuk mencatat perubahan
CREATE TRIGGER pengajuan_gaji_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON pengajuan_gaji
    FOR EACH ROW
    EXECUTE FUNCTION log_pengajuan_gaji_changes();

-- ============================================
-- 6. VIEW UNTUK ADMIN (HELPER)
-- ============================================

-- View untuk admin melihat detail pengajuan dengan user info
CREATE OR REPLACE VIEW pengajuan_gaji_detail AS
SELECT 
    pg.id,
    pg.user_id,
    pg.periode_id,
    pg.nominal_gaji,
    pg.status,
    pg.rekening_tujuan,
    pg.alasan_penolakan,
    pg.created_at,
    pg.approved_at,
    pg.approved_by,
    pg.rejected_at,
    pg.rejected_by,
    pg.paid_at,
    pg.paid_by,
    u.username,
    u.nama_ic,
    u.jabatan,
    ps.gaji_pokok,
    ps.total_bonus,
    ps.total_potongan,
    ps.detail_absensi,
    ps.detail_bonus,
    ps.detail_potongan
FROM pengajuan_gaji pg
LEFT JOIN auth.users u ON pg.user_id = u.id
LEFT JOIN payroll_snapshots ps ON pg.snapshot_id = ps.id;

-- ============================================
-- 7. STORED PROCEDURE UNTUK BUSINESS LOGIC
-- ============================================

-- Function untuk update status pengajuan
CREATE OR REPLACE FUNCTION update_pengajuan_status(
    p_pengajuan_id BIGINT,
    p_new_status TEXT,
    p_admin_id UUID,
    p_alasan TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_current_status TEXT;
    v_user_id UUID;
BEGIN
    -- Check apakah pengajuan exist
    SELECT status, user_id INTO v_current_status, v_user_id
    FROM pengajuan_gaji
    WHERE id = p_pengajuan_id;

    IF v_current_status IS NULL THEN
        RETURN QUERY SELECT false, 'Pengajuan tidak ditemukan'::TEXT;
        RETURN;
    END IF;

    -- Update berdasarkan status baru
    CASE p_new_status
        WHEN 'disetujui' THEN
            UPDATE pengajuan_gaji
            SET status = 'disetujui',
                approved_at = NOW(),
                approved_by = p_admin_id
            WHERE id = p_pengajuan_id;
            RETURN QUERY SELECT true, 'Pengajuan disetujui'::TEXT;

        WHEN 'ditolak' THEN
            UPDATE pengajuan_gaji
            SET status = 'ditolak',
                rejected_at = NOW(),
                rejected_by = p_admin_id,
                alasan_penolakan = p_alasan
            WHERE id = p_pengajuan_id;
            RETURN QUERY SELECT true, 'Pengajuan ditolak'::TEXT;

        WHEN 'sudah_diambil' THEN
            UPDATE pengajuan_gaji
            SET status = 'sudah_diambil',
                paid_at = NOW(),
                paid_by = p_admin_id
            WHERE id = p_pengajuan_id;
            RETURN QUERY SELECT true, 'Pembayaran dikonfirmasi'::TEXT;

        ELSE
            RETURN QUERY SELECT false, 'Status tidak valid'::TEXT;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. TESTING DATA (OPTIONAL)
-- ============================================
-- 
-- Uncomment untuk insert sample data
-- 
-- INSERT INTO pengajuan_gaji (
--     user_id, 
--     periode_id, 
--     nominal_gaji, 
--     status, 
--     rekening_tujuan
-- ) VALUES (
--     'YOUR-USER-ID',
--     '2024-W1',
--     3200000,
--     'menunggu_admin',
--     'BCA 1234567890'
-- )
-- ON CONFLICT (user_id, periode_id) DO NOTHING;

-- ============================================
-- 9. VERIFICATION QUERIES
-- ============================================
--
-- Jalankan query di bawah untuk verify setup:
--

-- Check apakah tabel sudah dibuat
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'pengajuan_gaji';

-- Check index
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'pengajuan_gaji';

-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'pengajuan_gaji';

-- Check policies
SELECT tablename, policyname, permissive, qual 
FROM pg_policies 
WHERE tablename = 'pengajuan_gaji';

-- ============================================
-- 10. BACKUP & RESTORE (OPTIONAL)
-- ============================================
--
-- Backup tabel pengajuan_gaji:
-- SELECT * FROM pengajuan_gaji WHERE created_at > NOW() - INTERVAL '30 days';
--
-- Restore (jika ada error):
-- DELETE FROM pengajuan_gaji WHERE id = ?;
--

-- ============================================
-- NOTES:
-- ============================================
--
-- 1. Pastikan auth.users table sudah ada (Supabase default)
-- 2. Pastikan payroll_snapshots table sudah ada
-- 3. Sesuaikan logic admin check dengan sistem role Anda
-- 4. Enable Supabase Realtime untuk table (optional)
-- 5. Monitor tabel audit untuk troubleshooting
--
-- ============================================

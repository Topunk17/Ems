/**
 * ============================================
 * UI & EVENT HANDLER UNTUK PAYROLL SYSTEM
 * ============================================
 */

// ============================================
// HALAMAN PENARIKAN GAJI - LOAD & DISPLAY
// ============================================

/**
 * Fungsi membuka menu penarikan gaji user
 * Menampilkan data payroll dari snapshot dan status pengajuan
 */
async function bukaMenuPenarikanGaji() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser) {
            showNotif('User tidak terdeteksi', 'error');
            return;
        }

        console.log('[UI] Membuka menu penarikan gaji untuk user:', currentUser.username);

        // Ambil periode ID minggu ini
        const periodeId = getPeriodeId();
        console.log('[UI] Periode ID:', periodeId);

        // Ambil snapshot payroll
        const snapshot = await ambilPayrollSnapshot(currentUser.id, periodeId);

        if (!snapshot) {
            showNotif('Data payroll belum tersedia untuk periode ini', 'warning');
            return;
        }

        // Ambil status pengajuan
        const { data: pengajuan, error } = await supabase
            .from('pengajuan_gaji')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('periode_id', periodeId)
            .single();

        // Tampilkan halaman dengan data lengkap
        await renderHalamanPenarikanGaji(currentUser, snapshot, pengajuan);
        show('view-penarikan-gaji-v2');

    } catch (error) {
        console.error('[UI] Error buka menu penarikan:', error);
        showNotif(`Error: ${error.message}`, 'error');
    }
}

/**
 * Fungsi render halaman penarikan gaji user
 * @param {Object} user - Data user
 * @param {Object} snapshot - Data snapshot payroll
 * @param {Object} pengajuan - Data pengajuan (bisa null)
 */
async function renderHalamanPenarikanGaji(user, snapshot, pengajuan) {
    try {
        const container = document.getElementById('penarikan-gaji-content');
        if (!container) {
            console.error('[UI] Container penarikan gaji tidak ditemukan');
            return;
        }

        // Tentukan status dan button
        const status = pengajuan?.status || 'belum_mengajukan';
        const hariIni = new Date().getDay();
        const daftarHariKerjaPengajuan = [1, 2, 3]; // Senin, Selasa, Rabu
        const periodeAktif = daftarHariKerjaPengajuan.includes(hariIni);

        // Parse detail dari JSON string
        const detailBonus = JSON.parse(snapshot.detail_bonus || '[]');
        const detailPotongan = JSON.parse(snapshot.detail_potongan || '[]');
        const detailAbsensi = JSON.parse(snapshot.detail_absensi || '[]');

        // HTML halaman
        let html = `
            <div style="padding: 20px;">
                <!-- HEADER -->
                <a href="#" class="btn-back" onclick="show('view-dashboard'); return false;">← Kembali</a>
                
                <div class="section-title" style="margin-top: 20px;">
                    💳 DETAIL PAYROLL MINGGU INI
                </div>

                <!-- INFO PERIODE -->
                <div class="loket-card">
                    <div class="loket-header">
                        <div class="loket-icon">📅</div>
                        <div class="loket-title">Periode Payroll</div>
                    </div>
                    <div class="loket-desc">
                        ${new Date(snapshot.periode_mulai).toLocaleDateString('id-ID')} - ${new Date(snapshot.periode_selesai).toLocaleDateString('id-ID')}
                    </div>
                </div>

                <!-- STATUS PENGAJUAN -->
                <div class="loket-card">
                    <div class="loket-header">
                        <div class="loket-icon">📊</div>
                        <div class="loket-title">Status Pengajuan</div>
                    </div>
                    <div style="margin-left: 52px; margin-top: 10px;">
                        ${getBadgeHTML(status)}
                    </div>
                    ${pengajuan?.alasan_penolakan ? `
                        <div style="margin-left: 52px; margin-top: 10px; padding: 10px; background: #FEE2E2; border-radius: 8px; border-left: 3px solid #DC2626; font-size: 12px; color: #7F1D1D;">
                            <strong>Alasan Penolakan:</strong><br>
                            ${pengajuan.alasan_penolakan}
                        </div>
                    ` : ''}
                </div>

                <!-- DETAIL GAJI -->
                <div class="loket-card">
                    <div class="loket-header">
                        <div class="loket-icon">💰</div>
                        <div class="loket-title">Rincian Gaji</div>
                    </div>
                    <div style="margin-left: 52px; margin-top: 10px;">
                        <div style="margin-bottom: 8px; padding: 8px; background: #F3F4F6; border-radius: 6px;">
                            <span style="font-size: 11px; color: #6B7280; font-weight: 600;">GAJI POKOK</span><br>
                            <span style="font-size: 14px; color: #1F2937; font-weight: 700;">${formatRupiah(snapshot.gaji_pokok)}</span>
                        </div>
                        
                        <div style="margin-bottom: 8px; padding: 8px; background: #DCFCE7; border-radius: 6px;">
                            <span style="font-size: 11px; color: #15803D; font-weight: 600;">BONUS</span><br>
                            <span style="font-size: 14px; color: #15803D; font-weight: 700;">+ ${formatRupiah(snapshot.total_bonus)}</span>
                        </div>
                        
                        <div style="margin-bottom: 8px; padding: 8px; background: #FEE2E2; border-radius: 6px;">
                            <span style="font-size: 11px; color: #DC2626; font-weight: 600;">POTONGAN</span><br>
                            <span style="font-size: 14px; color: #DC2626; font-weight: 700;">- ${formatRupiah(snapshot.total_potongan)}</span>
                        </div>
                        
                        <div style="margin-top: 12px; padding: 12px; background: linear-gradient(135deg, #e11d48 0%, #9f1239 100%); border-radius: 8px; color: white;">
                            <span style="font-size: 11px; color: #fecdd3; font-weight: 600;">TOTAL GAJI BERSIH (TAKE HOME PAY)</span><br>
                            <span style="font-size: 18px; font-weight: 900;">${formatRupiah(snapshot.total_gaji)}</span>
                        </div>
                    </div>
                </div>

                <!-- DETAIL ABSENSI -->
                <div class="loket-card">
                    <div class="loket-header">
                        <div class="loket-icon">⏱️</div>
                        <div class="loket-title">Data Absensi</div>
                    </div>
                    <div style="margin-left: 52px; margin-top: 10px; font-size: 12px;">
                        <div style="margin-bottom: 6px;"><strong>Total Jam Kerja:</strong> ${snapshot.total_jam} jam</div>
                        <div style="margin-bottom: 6px;"><strong>Hari Masuk:</strong> ${snapshot.jumlah_masuk} hari</div>
                        <div style="margin-bottom: 6px;"><strong>Izin/Cuti:</strong> ${snapshot.jumlah_izin} hari</div>
                        <div style="margin-bottom: 6px;"><strong>Alpa:</strong> ${snapshot.jumlah_alpa} hari</div>
                    </div>
                </div>

                <!-- DETAIL BONUS -->
                ${detailBonus.length > 0 ? `
                    <div class="loket-card">
                        <div class="loket-header">
                            <div class="loket-icon">🎁</div>
                            <div class="loket-title">Rincian Bonus</div>
                        </div>
                        <div style="margin-left: 52px; margin-top: 10px; font-size: 12px;">
                            ${detailBonus.map(bonus => `
                                <div style="margin-bottom: 8px; padding: 8px; background: #F0FDF4; border-radius: 6px; border-left: 3px solid #10B981;">
                                    <div style="font-weight: 600; color: #1F2937;">${bonus.tipe}</div>
                                    <div style="color: #6B7280; font-size: 11px;">${bonus.syarat || bonus.detail || bonus.jabatan || ''}</div>
                                    <div style="color: #15803D; font-weight: 700; margin-top: 4px;">+ ${formatRupiah(bonus.nominal)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- DETAIL POTONGAN -->
                ${detailPotongan.length > 0 ? `
                    <div class="loket-card">
                        <div class="loket-header">
                            <div class="loket-icon">📉</div>
                            <div class="loket-title">Rincian Potongan</div>
                        </div>
                        <div style="margin-left: 52px; margin-top: 10px; font-size: 12px;">
                            ${detailPotongan.map(potongan => `
                                <div style="margin-bottom: 8px; padding: 8px; background: #FEF2F2; border-radius: 6px; border-left: 3px solid #DC2626;">
                                    <div style="font-weight: 600; color: #1F2937;">${potongan.tipe}</div>
                                    <div style="color: #6B7280; font-size: 11px;">${potongan.detail || potongan.persentase || ''}</div>
                                    <div style="color: #DC2626; font-weight: 700; margin-top: 4px;">- ${formatRupiah(potongan.nominal)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- FORM PENGAJUAN -->
                ${status === 'belum_mengajukan' ? `
                    <div class="loket-card" style="background: #FEF3C7; border: 2px solid #FBBF24;">
                        <div class="loket-header">
                            <div class="loket-icon">⚠️</div>
                            <div class="loket-title">Form Pengajuan Penarikan</div>
                        </div>
                        <div style="margin-left: 52px; margin-top: 10px;">
                            <div style="margin-bottom: 15px; font-size: 12px; color: #78350F;">
                                ${periodeAktif 
                                    ? '✅ Periode pengajuan terbuka (Senin - Rabu)' 
                                    : '❌ Periode pengajuan ditutup (Kamis - Minggu). Silakan tunggu periode berikutnya.'}
                            </div>

                            <div style="margin-bottom: 15px;">
                                <label style="display: block; font-size: 11px; font-weight: 700; margin-bottom: 5px;">REKENING TUJUAN</label>
                                <textarea 
                                    id="rekening-input" 
                                    placeholder="Contoh: BCA 1234567890 / DANA 0812XXXX"
                                    style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid #D97706; border-radius: 8px; font-size: 12px;"
                                ></textarea>
                            </div>

                            <button 
                                class="btn-loket" 
                                onclick="submitPengajuanGaji('${user.id}', '${getPeriodeId()}', ${snapshot.total_gaji})"
                                ${!periodeAktif ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}
                                style="margin-left: 0; width: 100%;"
                            >
                                ${periodeAktif ? 'AJUKAN PENARIKAN' : 'PENGAJUAN DITUTUP'}
                            </button>
                        </div>
                    </div>
                ` : ''}

                <!-- STATUS PERSETUJUAN -->
                ${status === 'menunggu_admin' ? `
                    <div class="loket-card" style="background: #FEF3C7; border: 2px solid #FBBF24;">
                        <div class="loket-header">
                            <div class="loket-icon">⏳</div>
                            <div class="loket-title">Menunggu Persetujuan Admin</div>
                        </div>
                        <div style="margin-left: 52px; margin-top: 10px; font-size: 12px; color: #78350F;">
                            Pengajuan Anda sedang ditinjau oleh Admin. Mohon tunggu notifikasi persetujuan.
                        </div>
                    </div>
                ` : ''}

                <!-- STATUS DISETUJUI -->
                ${status === 'disetujui' ? `
                    <div class="loket-card" style="background: #DBEAFE; border: 2px solid #3B82F6;">
                        <div class="loket-header">
                            <div class="loket-icon">✅</div>
                            <div class="loket-title">Pengajuan Disetujui</div>
                        </div>
                        <div style="margin-left: 52px; margin-top: 10px; font-size: 12px; color: #1E40AF;">
                            Pengajuan Anda telah disetujui Admin. Dana akan ditransfer sesuai rekening tujuan yang Anda daftarkan.
                        </div>
                    </div>
                ` : ''}

                <!-- STATUS SUDAH DIAMBIL -->
                ${status === 'sudah_diambil' ? `
                    <div class="loket-card" style="background: #D1FAE5; border: 2px solid #10B981;">
                        <div class="loket-header">
                            <div class="loket-icon">💚</div>
                            <div class="loket-title">Gaji Sudah Diambil</div>
                        </div>
                        <div style="margin-left: 52px; margin-top: 10px; font-size: 12px; color: #065F46;">
                            Gaji Anda telah berhasil ditransfer. Terima kasih telah bekerja dengan baik!
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error('[UI] Error render halaman penarikan:', error);
        showNotif(`Error: ${error.message}`, 'error');
    }
}

/**
 * Fungsi submit pengajuan penarikan gaji
 * @param {string} userId - ID user
 * @param {string} periodeId - ID periode
 * @param {number} totalGaji - Nominal gaji
 */
async function submitPengajuanGaji(userId, periodeId, totalGaji) {
    try {
        const rekening = document.getElementById('rekening-input').value.trim();

        if (!rekening) {
            showNotif('Masukkan rekening tujuan terlebih dahulu', 'warning');
            return;
        }

        console.log('[UI] Submit pengajuan gaji');

        // Ajukan penarikan
        const pengajuan = await ajukanPenarikanGaji(userId, periodeId);

        // Update rekening tujuan
        await updateRekeningTujuan(pengajuan.id, rekening);

        showNotif('✅ Pengajuan berhasil dikirim ke Admin. Mohon tunggu konfirmasi.', 'success');

        // Reload halaman
        setTimeout(() => {
            bukaMenuPenarikanGaji();
        }, 1500);

    } catch (error) {
        console.error('[UI] Error submit pengajuan:', error);
        showNotif(`Error: ${error.message}`, 'error');
    }
}

// ============================================
// ADMIN PANEL - MANAJEMEN PENGAJUAN
// ============================================

/**
 * Fungsi load data pengajuan untuk admin
 * Menampilkan semua pengajuan pending
 */
async function loadPengajuanGajiAdmin() {
    try {
        console.log('[ADMIN] Load pengajuan gaji');

        // Ambil semua pengajuan dengan status menunggu_admin
        const { data: pengajuan, error } = await supabase
            .from('pengajuan_gaji')
            .select(`
                id,
                user_id,
                periode_id,
                nominal_gaji,
                status,
                created_at,
                rekening_tujuan,
                alasan_penolakan,
                payroll_snapshots:snapshot_id(periode_mulai, periode_selesai)
            `)
            .eq('status', 'menunggu_admin')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Render tabel admin
        await renderTabelPengajuanAdmin(pengajuan);

    } catch (error) {
        console.error('[ADMIN] Error load pengajuan:', error);
        showNotif(`Error: ${error.message}`, 'error');
    }
}

/**
 * Fungsi render tabel pengajuan admin
 * @param {Array} pengajuan - Data pengajuan
 */
async function renderTabelPengajuanAdmin(pengajuan) {
    try {
        const container = document.getElementById('admin-pengajuan-gaji-table');
        if (!container) return;

        // Ambil data user untuk setiap pengajuan
        let html = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #1F2937; color: white;">
                            <th style="padding: 12px; text-align: left; font-size: 12px;">Username</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px;">Periode</th>
                            <th style="padding: 12px; text-align: right; font-size: 12px;">Nominal</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px;">Rekening</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const pengajuanItem of pengajuan) {
            // Ambil data user
            const { data: userData } = await supabase
                .from('users')
                .select('username, nama_ic, jabatan')
                .eq('id', pengajuanItem.user_id)
                .single();

            if (!userData) continue;

            html += `
                <tr style="border-bottom: 1px solid #E5E7EB;">
                    <td style="padding: 12px; font-size: 12px;">
                        <strong>${userData.username}</strong><br>
                        <span style="color: #6B7280; font-size: 11px;">${userData.nama_ic}</span>
                    </td>
                    <td style="padding: 12px; font-size: 12px;">
                        ${pengajuanItem.periode_id}
                    </td>
                    <td style="padding: 12px; text-align: right; font-size: 12px; font-weight: 700;">
                        ${formatRupiah(pengajuanItem.nominal_gaji)}
                    </td>
                    <td style="padding: 12px; font-size: 11px;">
                        ${pengajuanItem.rekening_tujuan || '-'}
                    </td>
                    <td style="padding: 12px; font-size: 11px;">
                        <button 
                            onclick="openDetailPengajuan(${pengajuanItem.id})"
                            style="background: #3B82F6; color: white; padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; margin-right: 6px;"
                        >Detail</button>
                        <button 
                            onclick="setujuiPengajuan(${pengajuanItem.id})"
                            style="background: #10B981; color: white; padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; margin-right: 6px;"
                        >ACC</button>
                        <button 
                            onclick="bukaTolakModal(${pengajuanItem.id})"
                            style="background: #EF4444; color: white; padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer;"
                        >Tolak</button>
                    </td>
                </tr>
            `;
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = pengajuan.length > 0 ? html : '<div style="padding: 20px; text-align: center; color: #9CA3AF;">Tidak ada pengajuan yang menunggu ACC</div>';

    } catch (error) {
        console.error('[ADMIN] Error render tabel:', error);
    }
}

/**
 * Fungsi admin setujui pengajuan
 * @param {number} pengajuanId - ID pengajuan
 */
async function setujuiPengajuan(pengajuanId) {
    try {
        const currentAdmin = JSON.parse(localStorage.getItem('currentUser'));
        
        console.log('[ADMIN] Menyetujui pengajuan ID:', pengajuanId);

        await setujuiPengajuanGaji(pengajuanId, currentAdmin.id);
        
        showNotif('✅ Pengajuan telah disetujui', 'success');
        
        // Reload tabel
        setTimeout(() => {
            loadPengajuanGajiAdmin();
        }, 1000);

    } catch (error) {
        console.error('[ADMIN] Error setujui:', error);
        showNotif(`Error: ${error.message}`, 'error');
    }
}

/**
 * Fungsi buka modal tolak pengajuan
 * @param {number} pengajuanId - ID pengajuan
 */
function bukaTolakModal(pengajuanId) {
    const alasan = prompt('Masukkan alasan penolakan:');
    
    if (alasan !== null) {
        tolakPengajuan(pengajuanId, alasan);
    }
}

/**
 * Fungsi admin tolak pengajuan
 * @param {number} pengajuanId - ID pengajuan
 * @param {string} alasan - Alasan penolakan
 */
async function tolakPengajuan(pengajuanId, alasan) {
    try {
        const currentAdmin = JSON.parse(localStorage.getItem('currentUser'));
        
        console.log('[ADMIN] Menolak pengajuan ID:', pengajuanId);

        await tolakPengajuanGaji(pengajuanId, currentAdmin.id, alasan);
        
        showNotif('❌ Pengajuan telah ditolak', 'success');
        
        // Reload tabel
        setTimeout(() => {
            loadPengajuanGajiAdmin();
        }, 1000);

    } catch (error) {
        console.error('[ADMIN] Error tolak:', error);
        showNotif(`Error: ${error.message}`, 'error');
    }
}

/**
 * Fungsi buka detail pengajuan
 * @param {number} pengajuanId - ID pengajuan
 */
async function openDetailPengajuan(pengajuanId) {
    try {
        const { data: pengajuan, error } = await supabase
            .from('pengajuan_gaji')
            .select('*')
            .eq('id', pengajuanId)
            .single();

        if (error) throw error;

        const { data: userData } = await supabase
            .from('users')
            .select('username, nama_ic, jabatan, gaji')
            .eq('id', pengajuan.user_id)
            .single();

        const message = `
📋 DETAIL PENGAJUAN PENARIKAN GAJI

👤 USER: ${userData.username} (${userData.nama_ic})
🎖️ JABATAN: ${userData.jabatan}
📅 PERIODE: ${pengajuan.periode_id}
💰 NOMINAL: ${formatRupiah(pengajuan.nominal_gaji)}
🏦 REKENING: ${pengajuan.rekening_tujuan || 'Belum diisi'}
📊 STATUS: ${pengajuan.status}
⏰ TANGGAL PENGAJUAN: ${new Date(pengajuan.created_at).toLocaleString('id-ID')}
        `;

        alert(message);

    } catch (error) {
        console.error('[ADMIN] Error detail:', error);
        showNotif('Error membuka detail', 'error');
    }
}

console.log('[PAYROLL UI SYSTEM] Module loaded successfully');

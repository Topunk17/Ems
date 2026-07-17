/**
 * ============================================
 * PAYROLL-SYSTEM.JS - FIXED VERSION
 * Sinkronisasi 100% dengan Database Supabase
 * ============================================
 */

// ==========================================
// 1. CONSTANTS & CONFIG
// ==========================================
const SUPABASE_URL = 'https://mrmydhxrlctxgxatqrjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybXlkaHhybGN0eGd4YXRxcmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTMyMTUsImV4cCI6MjA5OTI2OTIxNX0.VjB8eIIH9m[...]

// Use global supabaseClient from script.js
const getSupabase = () => window.supabaseClient;

// ==========================================
// 2. PERHITUNGAN PAYROLL UTAMA (FIXED)
// ==========================================

/**
 * Fungsi utama perhitungan gaji - FIXED VERSION
 * @param {string} userId - User ID (bukan username)
 * @param {string} tanggalAwal - Format: YYYY-MM-DD
 * @param {string} tanggalAkhir - Format: YYYY-MM-DD
 * @returns {Promise<Object>} Data payroll lengkap
 */
async function hitungDataGajiUtama(userId, tanggalAwal, tanggalAkhir) {
    try {
        console.log(`[PAYROLL] Mulai perhitungan untuk user ${userId}: ${tanggalAwal} - ${tanggalAkhir}`);

        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        // Step 1: Ambil data user dari tabel users
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, username, nama_ic, jabatan, gaji')
            .eq('id', userId)
            .single();

        if (userError || !userData) {
            throw new Error(`User ${userId} tidak ditemukan`);
        }

        const gajiPokok = parseFloat(userData.gaji) || 0;
        const jabatan = userData.jabatan;

        console.log(`[PAYROLL] User ditemukan: ${userData.username} (${jabatan}) - Gaji Pokok: Rp ${gajiPokok.toLocaleString('id-ID')}`);

        // Step 2: Ambil data absensi yang approved
        const { data: absensiData, error: absensiError } = await supabase
            .from('absensi')
            .select('id, durasi_jam, status, created_at, keterangan')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .gte('created_at', `${tanggalAwal}T00:00:00`)
            .lte('created_at', `${tanggalAkhir}T23:59:59`);

        if (absensiError) {
            console.error('[PAYROLL] Error ambil absensi:', absensiError);
            throw absensiError;
        }

        // Step 3: Ambil data izin/cuti yang approved
        const { data: izinData, error: izinError } = await supabase
            .from('izin_cuti')
            .select('id, tanggal_mulai, tanggal_selesai, status, alasan')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .gte('tanggal_mulai', tanggalAwal)
            .lte('tanggal_selesai', tanggalAkhir);

        if (izinError) {
            console.error('[PAYROLL] Error ambil izin:', izinError);
            throw izinError;
        }

        // Step 4: Hitung total jam kerja
        let totalJam = 0;
        let detailAbsensi = [];

        if (absensiData && absensiData.length > 0) {
            detailAbsensi = absensiData.map(absen => ({
                tanggal: new Date(absen.created_at).toLocaleDateString('id-ID'),
                durasi_jam: parseFloat(absen.durasi_jam) || 0,
                keterangan: absen.keterangan || 'Kerja Normal'
            }));

            totalJam = absensiData.reduce((sum, absen) => {
                return sum + (parseFloat(absen.durasi_jam) || 0);
            }, 0);
        }

        // Step 5: Hitung jumlah hari masuk
        const hariMasukSet = new Set(
            absensiData.map(a => new Date(a.created_at).toLocaleDateString('id-ID'))
        );
        const jumlahMasuk = hariMasukSet.size;

        // Step 6: Hitung jumlah izin
        let jumlahIzin = 0;
        let detailIzin = [];

        if (izinData && izinData.length > 0) {
            izinData.forEach(izin => {
                const mulai = new Date(izin.tanggal_mulai);
                const selesai = new Date(izin.tanggal_selesai);
                let hariIzin = 0;

                for (let d = new Date(mulai); d <= selesai; d.setDate(d.getDate() + 1)) {
                    hariIzin++;
                }

                jumlahIzin += hariIzin;
                detailIzin.push({
                    tanggal_mulai: izin.tanggal_mulai,
                    tanggal_selesai: izin.tanggal_selesai,
                    hari: hariIzin,
                    alasan: izin.alasan
                });
            });
        }

        // Step 7: Hitung alpa
        const hariKerjaPerBulan = 22;
        const jumlahAlpa = Math.max(0, hariKerjaPerBulan - jumlahMasuk - jumlahIzin);

        console.log(`[PAYROLL] Absensi: ${jumlahMasuk} hari | Izin: ${jumlahIzin} hari | Alpa: ${jumlahAlpa} hari | Total Jam: ${totalJam}h`);

        // Step 8: Hitung bonus dan potongan
        const { totalBonus, detailBonus } = hitungBonus(
            jabatan,
            jumlahMasuk,
            totalJam,
            gajiPokok
        );

        const { totalPotongan, detailPotongan } = hitungPotongan(
            jabatan,
            jumlahAlpa,
            jumlahIzin,
            gajiPokok
        );

        // Step 9: Hitung total gaji bersih
        const totalGaji = gajiPokok + totalBonus - totalPotongan;

        console.log(`[PAYROLL] Gaji Pokok: Rp ${gajiPokok.toLocaleString('id-ID')} | Bonus: Rp ${totalBonus.toLocaleString('id-ID')} | Potongan: Rp ${totalPotongan.toLocaleString('id-ID')} | Total: Rp ${totalGaji.toLocaleString('id-ID')}`);

        // Step 10: Return data payroll lengkap
        return {
            user_id: userId,
            username: userData.username,
            nama_ic: userData.nama_ic,
            jabatan: jabatan,
            total_jam: totalJam,
            jumlah_masuk: jumlahMasuk,
            jumlah_izin: jumlahIzin,
            jumlah_alpa: jumlahAlpa,
            gaji_pokok: gajiPokok,
            bonus: totalBonus,
            total_potongan: totalPotongan,
            total_gaji: totalGaji,
            detail_absensi: detailAbsensi,
            detail_potongan: detailPotongan,
            periode_mulai: tanggalAwal,
            periode_selesai: tanggalAkhir
        };

    } catch (error) {
        console.error('[PAYROLL] Error perhitungan gaji:', error);
        showNotif(`Error: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Fungsi perhitungan bonus
 * @param {string} jabatan - Jabatan pengguna
 * @param {number} hariMasuk - Jumlah hari masuk
 * @param {number} totalJam - Total jam kerja
 * @param {number} gajiPokok - Gaji pokok
 * @returns {Object} Total bonus dan detail
 */
function hitungBonus(jabatan, hariMasuk, totalJam, gajiPokok) {
    let totalBonus = 0;
    let detailBonus = [];

    // BONUS KEHADIRAN: 5% jika masuk minimal 20 hari
    if (hariMasuk >= 20) {
        const bonusKehadiran = gajiPokok * 0.05;
        totalBonus += bonusKehadiran;
        detailBonus.push({
            tipe: 'Bonus Kehadiran',
            persentase: '5%',
            nominal: bonusKehadiran,
            syarat: `Hadir ${hariMasuk} hari`
        });
    }

    // BONUS JAM KERJA: Rp 50.000 per jam jika lebih dari 160 jam
    if (totalJam > 160) {
        const jamTambahan = totalJam - 160;
        const bonusJam = jamTambahan * 50000;
        totalBonus += bonusJam;
        detailBonus.push({
            tipe: 'Bonus Jam Kerja',
            nominal: bonusJam,
            syarat: `${jamTambahan} jam x Rp 50.000`
        });
    }

    // BONUS JABATAN
    const bonusJabatan = getBonusJabatan(jabatan);
    if (bonusJabatan > 0) {
        totalBonus += bonusJabatan;
        detailBonus.push({
            tipe: 'Bonus Jabatan',
            nominal: bonusJabatan,
            jabatan: jabatan
        });
    }

    return {
        totalBonus: Math.round(totalBonus),
        detailBonus: detailBonus
    };
}

/**
 * Fungsi perhitungan potongan
 * @param {string} jabatan - Jabatan pengguna
 * @param {number} alpa - Jumlah hari alpa
 * @param {number} izin - Jumlah hari izin
 * @param {number} gajiPokok - Gaji pokok
 * @returns {Object} Total potongan dan detail
 */
function hitungPotongan(jabatan, alpa, izin, gajiPokok) {
    let totalPotongan = 0;
    let detailPotongan = [];

    // POTONGAN ALPA: Rp 100.000 per hari
    if (alpa > 0) {
        const potongAlpa = alpa * 100000;
        totalPotongan += potongAlpa;
        detailPotongan.push({
            tipe: 'Potongan Alpa',
            nominal: potongAlpa,
            detail: `${alpa} hari x Rp 100.000`
        });
    }

    // POTONGAN BPJS: 4%
    const potongBpjs = Math.round(gajiPokok * 0.04);
    if (potongBpjs > 0) {
        totalPotongan += potongBpjs;
        detailPotongan.push({
            tipe: 'BPJS (4%)',
            nominal: potongBpjs,
            persentase: '4%'
        });
    }

    // POTONGAN PPH: 1.5%
    const potongPph = Math.round(gajiPokok * 0.015);
    if (potongPph > 0) {
        totalPotongan += potongPph;
        detailPotongan.push({
            tipe: 'PPH (1.5%)',
            nominal: potongPph,
            persentase: '1.5%'
        });
    }

    return {
        totalPotongan: Math.round(totalPotongan),
        detailPotongan: detailPotongan
    };
}

/**
 * Fungsi mendapatkan bonus jabatan
 */
function getBonusJabatan(jabatan) {
    const bonusMap = {
        'Kepala EMS': 500000,
        'Vice Head': 300000,
        'Paramedis Senior': 200000,
        'Paramedis': 100000,
        'Medic': 100000,
        'Training': 0
    };

    return bonusMap[jabatan] || 0;
}

// ==========================================
// 3. PAYROLL SNAPSHOT (FIXED)
// ==========================================

/**
 * ✓ FIXED: Membuat payroll snapshot dengan kolom yang benar
 * Database: id, user_id, periode_id, periode_mulai, periode_selesai, 
 *           total_jam, jumlah_masuk, jumlah_izin, jumlah_alpa,
 *           total_potongan, total_gaji, detail_absensi, detail_potongan,
 *           status, created_at, locked_at, claimed_at, gaji_pokok, bonus, gaji_bersih
 */
async function buatPayrollSnapshot(dataGaji, periodeId) {
    try {
        console.log(`[SNAPSHOT] Membuat snapshot untuk periode: ${periodeId}`);

        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        if (!dataGaji || !dataGaji.user_id) {
            throw new Error('Data gaji tidak valid');
        }

        // Cek apakah sudah ada snapshot
        const { data: existingSnapshot, error: checkError } = await supabase
            .from('payroll_snapshots')
            .select('id')
            .eq('user_id', dataGaji.user_id)
            .eq('periode_id', periodeId)
            .maybeSingle();

        if (existingSnapshot) {
            console.log(`[SNAPSHOT] Snapshot sudah ada untuk user ${dataGaji.username} periode ${periodeId}`);
            return existingSnapshot;
        }

        // ✓ FIXED: Gunakan nama kolom yang benar di database
        const snapshotData = {
            user_id: dataGaji.user_id,
            periode_id: periodeId,
            periode_mulai: dataGaji.periode_mulai,
            periode_selesai: dataGaji.periode_selesai,
            total_jam: dataGaji.total_jam,
            jumlah_masuk: dataGaji.jumlah_masuk,
            jumlah_izin: dataGaji.jumlah_izin,
            jumlah_alpa: dataGaji.jumlah_alpa,
            gaji_pokok: dataGaji.gaji_pokok,
            bonus: dataGaji.bonus,  // ✓ FIXED: bukan detail_bonus
            total_potongan: dataGaji.total_potongan,
            total_gaji: dataGaji.total_gaji,
            detail_absensi: JSON.stringify(dataGaji.detail_absensi || []),
            detail_potongan: JSON.stringify(dataGaji.detail_potongan || []),
            status: 'locked',
            created_at: new Date().toISOString(),
            locked_at: new Date().toISOString(),
            gaji_bersih: dataGaji.total_gaji
        };

        const { data: inserted, error: insertError } = await supabase
            .from('payroll_snapshots')
            .insert([snapshotData])
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        console.log(`[SNAPSHOT] Snapshot berhasil dibuat untuk ${dataGaji.username}`);
        return inserted;

    } catch (error) {
        console.error('[SNAPSHOT] Error membuat snapshot:', error);
        showNotif(`Error snapshot: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Fungsi mengambil payroll snapshot
 */
async function ambilPayrollSnapshot(userId, periodeId) {
    try {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        const { data, error } = await supabase
            .from('payroll_snapshots')
            .select('*')
            .eq('user_id', userId)
            .eq('periode_id', periodeId)
            .maybeSingle();

        if (error) throw error;
        return data;

    } catch (error) {
        console.error('[SNAPSHOT] Error ambil snapshot:', error);
        return null;
    }
}

// ==========================================
// 4. PENGAJUAN PENARIKAN GAJI (FIXED)
// ==========================================

/**
 * Fungsi mengajukan penarikan gaji
 * User hanya dapat mengajukan pada hari Senin - Rabu
 */
async function ajukanPenarikanGaji(userId, periodeId) {
    try {
        console.log(`[PENARIKAN] User ${userId} mengajukan penarikan untuk periode ${periodeId}`);

        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        // Step 1: Cek hari (Senin-Rabu)
        const hariIni = new Date().getDay();
        const hariValid = [1, 2, 3]; // 1=Senin, 2=Selasa, 3=Rabu

        if (!hariValid.includes(hariIni)) {
            const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            throw new Error(`Pengajuan hanya tersedia Senin-Rabu. Hari ini: ${hari[hariIni]}`);
        }

        // Step 2: Ambil snapshot payroll
        const snapshot = await ambilPayrollSnapshot(userId, periodeId);
        if (!snapshot) {
            throw new Error('Payroll snapshot tidak ditemukan');
        }

        // Step 3: Cek apakah sudah pernah mengajukan
        const { data: existingRequest, error: checkError } = await supabase
            .from('pengajuan_gaji')
            .select('*')
            .eq('user_id', userId)
            .eq('periode_id', periodeId)
            .maybeSingle();

        if (existingRequest && existingRequest.status !== 'ditolak') {
            throw new Error(`Anda sudah mengajukan penarikan pada periode ini. Status: ${existingRequest.status}`);
        }

        // Step 4: Buat pengajuan baru
        const pengajuanData = {
            user_id: userId,
            periode_id: periodeId,
            snapshot_id: snapshot.id,
            nominal_gaji: snapshot.total_gaji,
            status: 'menunggu_admin',
            rekening_tujuan: null,
            created_at: new Date().toISOString()
        };

        const { data: pengajuan, error: insertError } = await supabase
            .from('pengajuan_gaji')
            .insert([pengajuanData])
            .select()
            .single();

        if (insertError) throw insertError;

        console.log(`[PENARIKAN] Pengajuan berhasil dibuat ID: ${pengajuan.id}`);
        return pengajuan;

    } catch (error) {
        console.error('[PENARIKAN] Error mengajukan penarikan:', error);
        showNotif(`Error: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Fungsi update rekening tujuan
 */
async function updateRekeningTujuan(pengajuanId, rekening) {
    try {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        const { data, error } = await supabase
            .from('pengajuan_gaji')
            .update({ rekening_tujuan: rekening })
            .eq('id', pengajuanId)
            .select()
            .single();

        if (error) throw error;
        return data;

    } catch (error) {
        console.error('[PENARIKAN] Error update rekening:', error);
        showNotif('Error update rekening', 'error');
        throw error;
    }
}

// ==========================================
// 5. ADMIN MANAGEMENT - PERSETUJUAN
// ==========================================

/**
 * Admin menyetujui pengajuan penarikan
 */
async function setujuiPengajuanGaji(pengajuanId, adminId) {
    try {
        console.log(`[ADMIN] Menyetujui pengajuan ID: ${pengajuanId}`);

        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        const { data, error } = await supabase
            .from('pengajuan_gaji')
            .update({
                status: 'disetujui',
                approved_at: new Date().toISOString(),
                approved_by: adminId
            })
            .eq('id', pengajuanId)
            .select()
            .single();

        if (error) throw error;

        console.log(`[ADMIN] Pengajuan disetujui`);
        return data;

    } catch (error) {
        console.error('[ADMIN] Error setujui pengajuan:', error);
        showNotif('Error menyetujui pengajuan', 'error');
        throw error;
    }
}

/**
 * Admin menolak pengajuan penarikan
 */
async function tolakPengajuanGaji(pengajuanId, adminId, alasan) {
    try {
        console.log(`[ADMIN] Menolak pengajuan ID: ${pengajuanId}`);

        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        const { data, error } = await supabase
            .from('pengajuan_gaji')
            .update({
                status: 'ditolak',
                rejected_at: new Date().toISOString(),
                rejected_by: adminId,
                alasan_penolakan: alasan
            })
            .eq('id', pengajuanId)
            .select()
            .single();

        if (error) throw error;

        console.log(`[ADMIN] Pengajuan ditolak`);
        return data;

    } catch (error) {
        console.error('[ADMIN] Error tolak pengajuan:', error);
        showNotif('Error menolak pengajuan', 'error');
        throw error;
    }
}

/**
 * Admin mengkonfirmasi pembayaran
 */
async function konfirmasiPembayaranGaji(pengajuanId, adminId) {
    try {
        console.log(`[ADMIN] Konfirmasi pembayaran ID: ${pengajuanId}`);

        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase client tidak terinisialisasi");

        const { data, error } = await supabase
            .from('pengajuan_gaji')
            .update({
                status: 'sudah_diambil',
                claimed_at: new Date().toISOString(),
                paid_by: adminId
            })
            .eq('id', pengajuanId)
            .select()
            .single();

        if (error) throw error;

        console.log(`[ADMIN] Pembayaran dikonfirmasi`);
        return data;

    } catch (error) {
        console.error('[ADMIN] Error konfirmasi pembayaran:', error);
        showNotif('Error konfirmasi pembayaran', 'error');
        throw error;
    }
}

// ==========================================
// 6. UTILITY FUNCTIONS
// ==========================================

/**
 * Mendapatkan status badge HTML
 */
function getBadgeHTML(status) {
    const badges = {
        'belum_mengajukan': '<span style="background: #9CA3AF; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">⚪ Belum Mengajukan</span>',
        'menunggu_admin': '<span style="background: #FBBF24; color: #1a202c; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">🟡 Menunggu ACC</span>',
        'disetujui': '<span style="background: #10B981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">🟢 Disetujui</span>',
        'ditolak': '<span style="background: #EF4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">🔴 Ditolak</span>',
        'sudah_diambil': '<span style="background: #059669; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">✅ Sudah Diambil</span>'
    };

    return badges[status] || badges['belum_mengajukan'];
}

/**
 * Mendapatkan periode ID berdasarkan minggu
 */
function getPeriodeId(date = new Date()) {
    const tahun = date.getFullYear();
    const d = new Date(date);
    const hari_ini = d.getDay();
    const diff = d.getDate() - hari_ini + (hari_ini === 0 ? -6 : 1);
    const senin = new Date(d.setDate(diff));
    
    const mingguKeberapa = Math.ceil((senin.getDate()) / 7);
    return `${tahun}-W${mingguKeberapa}`;
}

/**
 * Format rupiah
 */
function formatRupiah(num) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(num || 0);
}

console.log('[PAYROLL SYSTEM] Module loaded successfully (FIXED VERSION)');

// Refactored payroll frontend logic
// - Frontend must NOT generate payroll or change payroll_snapshots
// - Live update calls core engine function hitungDataGajiUtama(...) and only displays results
// - Penarikan hanya meng-insert ke pengajuan_gaji (user_id, periode_id, rekening_tujuan, status)
// - All server-side payroll generation / snapshot creation belongs to Edge Function + Cron

// ==========================================
// 1. SUPABASE CLIENT
// ==========================================
const supabaseUrl = 'https://mrmydhxrlctxgxatqrjq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybXlkaHhybGN0eGd4YXRxcmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTMyMTUsImV4cCI6MjA5OTI2OTIxNX0.VjB8eIIH9mdl_lAFnCavEd7ow7IAyCU6OSw0IimtJ8w';
window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// GLOBAL STATE
// ==========================================
let KLAIM_PERIODE_ID = "";       // Diisi dari RPC saat loadGajiMingguLalu dijalankan
let isSubmittingKlaim = false;   // Flag anti double submit

// ==========================================
// HELPERS & STANDAR GAJI
// ==========================================
function getGajiByJabatan(jabatan) {
    const jab = jabatan ? jabatan.trim() : 'Training';
    const standarGaji = {
        'Direktur Utama': 450000,
        'Wakil Direktur': 400000,
        'Direktur Keilmuan': 400000,
        'Direktur SDM': 380000,
        'Sekertaris Bendahara': 350000,
        'Komisi Umum': 320000,
        'Komisi Disiplin': 300000,
        'Dokter Spesialis': 280000,
        'Dokter Umum': 250000,
        'Perawat': 180000,
        'Training': 150000
    };
    return standarGaji[jab] || 150000;
}

async function terapkanHakAkses(jabatan) {
    if (!jabatan) return;
    const jabatanClean = jabatan.trim();
    const { data, error } = await supabaseClient
        .from('roles')
        .select('akses_admin, akses_rekam_medis, jabatan')
        .ilike('jabatan', jabatanClean)
        .single();

    if (error || !data) return;

    const adminElements = ['menu-admin-panel', 'menu-logs'];
    adminElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = data.akses_admin ? 'flex' : 'none';
    });

    const medisEl = document.getElementById('menu-rekam-medis');
    if (medisEl) medisEl.style.display = data.akses_rekam_medis ? 'flex' : 'none';
}

// ==========================================
// AUTHENTICATION (login/register)
// ==========================================
function toggleAuth() {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    if (!loginForm || !regForm) return;
    loginForm.style.display = (loginForm.style.display === 'none') ? 'block' : 'none';
    regForm.style.display = (regForm.style.display === 'none') ? 'block' : 'none';
}

async function masukDashboard(event) {
    event.preventDefault();
    const user = document.getElementById('username')?.value.trim();
    const pass = document.getElementById('password')?.value.trim();
    if (!user || !pass) return showNotif("Isi username & password!", "error");
    
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('username', user.trim())
            .eq('password', pass.trim())
            .single();
        if (error || !data) return showNotif("Username/Password salah!", "error");
        console.log(error);
console.log(data);
        
        localStorage.setItem('currentUser', data.username);
        localStorage.setItem('userJabatan', data.jabatan);
        await supabaseClient.from('users').update({ last_login: new Date().toISOString() }).eq('username', user);

        showNotif("Berhasil Login!");
        document.getElementById('view-login').style.display = 'none';
        show('view-dashboard');
        terapkanHakAkses(data.jabatan);
    } catch (e) {
        showNotif("Error: " + (e.message || e), "error");
    }
}

async function register(event) {
    event.preventDefault();
    const username = document.getElementById('reg-username')?.value;
    const namaIC = document.getElementById('reg-nama')?.value;
    const password = document.getElementById('reg-password')?.value;
    if (!username || !namaIC || !password) return showNotif("Lengkapi data!", "error");
    try {
        const { error } = await supabaseClient.from('users_pending').insert([{ username, nama_ic: namaIC, password, status: 'pending' }]);
        if (error) throw error;
        showNotif("Berhasil daftar! Menunggu ACC Admin.");
        toggleAuth();
    } catch (e) {
        showNotif("Gagal daftar: " + (e.message || e), "error");
    }
}

// ==========================================
// NAV & PROFILE
// ==========================================
function show(viewId) {
    document.querySelectorAll('.app-view, .overlay-ui').forEach(v => {
        if (!v.id.includes('form-')) v.style.display = 'none';
    });
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'flex';

    if (viewId === 'view-dashboard') loadProfilDashboard();
    if (viewId === 'view-gaji') {
        document.getElementById('info-final-penarikan').innerHTML = "🔄 Memuat parameter server...";
        loadGajiMingguLalu();
    }
    if (['view-request-absen', 'view-request-medis', 'view-request-izin', 'view-request-akun'].includes(viewId)) {
        const type = viewId.replace('view-request-', '');
        loadRequestData(type);
    }
}

async function loadProfilDashboard() {
    const user = localStorage.getItem('currentUser');
    if (!user) return window.location.reload();

    const { data } = await supabaseClient.from('users').select('*').eq('username', user).single();
    if (data) {
        document.getElementById('dash-nama').innerText = data.nama_ic || '-';
        document.getElementById('dash-jabatan').innerText = data.jabatan || '-';
        document.getElementById('dash-login').innerText = data.last_login || '-';
        terapkanHakAkses(data.jabatan);
        const formatRupiah = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(num || 0);
        document.getElementById('dash-gaji').innerText = formatRupiah(data.gaji || 0);
    }
}

// ==========================================
// NOTIFICATION & INITIALIZATION
// ==========================================
function showNotif(pesan, tipe = 'success') {
    const notif = document.getElementById('notif-ui');
    if (!notif) return alert(pesan);
    notif.innerText = pesan;
    notif.className = 'notification-ui ' + (tipe === 'error' ? 'notif-error' : 'notif-success') + ' show';
    setTimeout(() => notif.classList.remove('show'), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const jabatan = localStorage.getItem('userJabatan');
    if (jabatan) terapkanHakAkses(jabatan);
});

// ==========================================
// UPLOAD FOTO (util)
// ==========================================
async function uploadSemuaFoto(files, folder) {
    let urls = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${folder}/${Date.now()}_${i}_${file.name}`;
        const { error } = await supabaseClient.storage.from('Foto_bukti').upload(fileName, file);
        if (error) throw error;
        const { data } = supabaseClient.storage.from('Foto_bukti').getPublicUrl(fileName);
        urls.push(data.publicUrl);
    }
    return urls.join(',');
}




// ==========================================
// Izin Cuti (use user_id everywhere)
// ==========================================
async function submitIzin() {
    const currentUser = localStorage.getItem('currentUser');
    const tglMulai = document.getElementById('tgl-mulai-cuti')?.value;
    const tglSelesai = document.getElementById('tgl-selesai-cuti')?.value;
    const alasan = document.getElementById('alasan-cuti')?.value.trim();

    if (!currentUser || !tglMulai || !tglSelesai || !alasan) {
        return showNotif("Harap lengkapi semua bidang pada formulir cuti!", "error");
    }

    try {
        const { error } = await supabaseClient
            .from('izin_cuti')
            .insert([{
                user_id: currentUser,
                tanggal_mulai: tglMulai,
                tanggal_selesai: tglSelesai,
                alasan: alasan,
                status: 'pending'
            }]);
        if (error) throw error;
        showNotif("Pengajuan izin cuti Anda berhasil dikirim ke antrean Admin!");
        show('view-dashboard');
    } catch (err) {
        console.error(err);
        showNotif("Gagal memproses permohonan cuti: " + (err.message || err), "error");
    }
}

// ==========================================
// Absensi submission (unchanged semantics)
// ==========================================
function hitungDurasiJam(onTime, offTime) {
    let onDate = new Date(`2000-01-01T${onTime}:00`);
    let offDate = new Date(`2000-01-01T${offTime}:00`);
    if (offDate < onDate) offDate.setDate(offDate.getDate() + 1);
    return ((offDate - onDate) / (1000 * 60 * 60));
}

async function submitAbsen() {
    const onDuty = document.getElementById('on-duty')?.value;
    const offDuty = document.getElementById('off-duty')?.value;
    const files = document.getElementById('foto-bukti')?.files || [];
    const currentUser = localStorage.getItem('currentUser');

    if (!onDuty || !offDuty) return showNotif("Harap isi parameter On Duty & Off Duty!", "error");

    try {
        let fotoUrl = "";
        if (files.length > 0) {
            showNotif("Mengunggah berkas bukti...", "success");
            fotoUrl = await uploadSemuaFoto(files, 'absen');
        }

        const durasi = hitungDurasiJam(onDuty, offDuty);

        const { error } = await supabaseClient.from('absensi').insert([{
            user_id: currentUser,
            keterangan: `On: ${onDuty} | Off: ${offDuty}`,
            foto_url: fotoUrl,
            durasi_jam: durasi,
            status: 'pending'
        }]);
        if (error) throw error;
        showNotif("Berkas absensi On Duty berhasil dikirim!");
        tutupFormAbsen();
    } catch (err) {
        console.error(err);
        showNotif("Gagal memproses absensi!", "error");
    }
}

// ==========================================
// Rekam Medis submission
// ==========================================
async function submitmedis() {
    const inputFoto = document.getElementById('rekam-medis');
    const files = inputFoto ? inputFoto.files : [];
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return showNotif("Sesi otentikasi kedaluwarsa.", "error");

    try {
        let url = '';
        if (files && files.length > 0) {
            showNotif("Mengunggah dokumentasi medis...", "success");
            url = await uploadSemuaFoto(files, 'medis');
        }

        const { error } = await supabaseClient.from('rekam_medis').insert([{
            user_id: currentUser,
            nama_pendamping: document.getElementById('medis-pendamping')?.value || '-',
            code_paramedis: document.getElementById('medis-code')?.value || '-',
            jenis_luka: document.getElementById('medis-luka')?.value || '-',
            tindakan_operasi: document.getElementById('medis-tindakan')?.value || '-',
            hasil_operasi: document.getElementById('medis-hasil')?.value || '-',
            tanggal_operasi: document.getElementById('medis-tanggal')?.value || new Date().toISOString().split('T')[0],
            jam_mulai: document.getElementById('medis-jam-mulai')?.value || '00:00',
            jam_selesai: document.getElementById('medis-jam-selesai')?.value || '00:00',
            durasi_operasi: document.getElementById('medis-durasi')?.value || '-',
            foto_url: url,
            status: 'pending'
        }]);
        if (error) throw error;
        showNotif("Rekam medis sukses diarsipkan!");
        show('view-dashboard');
    } catch (e) {
        showNotif("Gagal memproses rekam medis: " + (e.message || e), "error");
    }
}

// ==========================================
// ADMIN REQUESTS (load/process) -- keep server semantics
// ==========================================
function getTableName(type) {
    if (type === 'absen') return 'absensi';
    if (type === 'medis') return 'rekam_medis';
    if (type === 'izin') return 'izin_cuti';
    if (type === 'akun') return 'users_pending';
    return null;
}

async function loadRequestData(type) {
    const container = document.getElementById(`${type}-list-container`);
    if (container) container.innerHTML = '<p style="text-align:center; font-weight:bold; padding:20px;">🔄 Memuat data antrean...</p>';
    const tableName = getTableName(type);
    try {
        const { data, error } = await supabaseClient.from(tableName).select('*').eq('status', 'pending');
        if (error) throw error;
        renderAdminRequests(type, data);
    } catch (err) {
        if (container) container.innerHTML = '<p style="text-align:center; color:red; padding:20px;">❌ Gagal memuat pengajuan.</p>';
    }
}

function renderAdminRequests(type, dataArray) {
    const container = document.getElementById(`${type}-list-container`);
    if (!dataArray || dataArray.length === 0) {
        if (container) container.innerHTML = '<p style="text-align:center; color:#6b7280; padding:20px;">✅ Tidak ada antrean pengajuan.</p>';
        return;
    }

    container.innerHTML = '';
    const buatGalleryFoto = (urlStr) => {
        if (!urlStr) return '<div style="background:#f3f4f6; padding:10px; border-radius:8px; margin-top:10px; font-size:11px; color:#6b7280; text-align:center;">Belum ada foto terlampir</div>';
        return urlStr.split(',').map(url => `
            <a href="${url.trim()}" target="_blank">
                <img src="${url.trim()}" style="max-width: 100%; border-radius: 8px; margin-top: 10px; border: 1px solid #ddd; display: block;">
            </a>
        `).join('');
    };

    dataArray.forEach(item => {
        const card = document.createElement('div');
        card.className = 'request-card';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';

        let infoHTML = '';
        if (type === 'akun') {
            infoHTML = `
                <div style="margin-bottom: 12px; line-height: 1.6;">
                    <div style="font-size:12px; font-weight:bold; color:#2563eb; margin-bottom:5px;">INFORMASI PENDAFTAR</div>
                    <strong>Username UCP:</strong> ${item.username || '-'}<br>
                    <strong>Nama Karakter (IC):</strong> ${item.nama_ic || '-'}<br>
                    <strong>Jabatan:</strong> ${item.jabatan || 'Belum Diatur'}
                </div>`;
        } else if (type === 'absen') {
            infoHTML = `
                <div style="margin-bottom: 12px; line-height: 1.6;">
                    <div style="font-size:12px; font-weight:bold; color:#2563eb; margin-bottom:5px;">DATA ABSENSI</div>
                    <strong>Pemohon:</strong> ${item.user_id || '-'}<br>
                    <strong>Keterangan Waktu:</strong> ${item.keterangan || '-'}<br>
                    ${buatGalleryFoto(item.foto_url)}
                </div>`;
        } else if (type === 'medis') {
            infoHTML = `
                <div style="margin-bottom: 12px; line-height: 1.6;">
                    <div style="font-size:12px; font-weight:bold; color:#2563eb; margin-bottom:5px;">REKAM MEDIS WARGA</div>
                    <strong>Pendamping:</strong> ${item.nama_pendamping || item.user_id || '-'}<br>
                    <strong>Code Paramedis:</strong> ${item.code_paramedis || '-'}<br>
                    <strong>Jenis Luka:</strong> ${item.jenis_luka || '-'}<br>
                    <strong>Tindakan & Hasil:</strong> ${item.tindakan_operasi || '-'} (${item.hasil_operasi || '-'})<br>
                    <strong>Waktu Operasi:</strong> ${item.tanggal_operasi || '-'} | Jam: ${item.jam_mulai || '-'} s/d ${item.jam_selesai || '-'}<br>
                    <strong>Durasi:</strong> ${item.durasi_operasi || '-'}<br>
                    ${buatGalleryFoto(item.foto_url)}
                </div>`;
        } else {
            infoHTML = `
                <div style="margin-bottom: 12px; line-height: 1.6;">
                    <div style="font-size:12px; font-weight:bold; color:#2563eb; margin-bottom:5px;">PENGAJUAN IZIN CUTI</div>
                    <strong>Pemohon:</strong> ${item.user_id || '-'}<br>
                    <strong>Tanggal Cuti:</strong> ${item.tanggal_mulai || '-'} s/d ${item.tanggal_selesai || '-'}<br>
                    <strong>Alasan:</strong> ${item.alasan || '-'}<br>
                </div>`;
        }

        card.innerHTML = `
            <div class="req-info" style="padding-right:0; width:100%;">${infoHTML}</div>
            <div class="req-actions" style="display:flex; justify-content: flex-end; gap:10px; width:100%; border-top: 1px solid #f3f4f6; padding-top: 12px; margin-top: 5px;">
                <button class="btn-acc" style="flex:1; background:#10b981; color:white; border:none; border-radius:8px; padding:10px;" onclick="prosesRequest('${type}', '${item.id}', 'approved')">Terima</button>
                <button class="btn-rej" style="flex:1; background:#ef4444; color:white; border:none; border-radius:8px; padding:10px;" onclick="prosesRequest('${type}', '${item.id}', 'rejected')">Tolak</button>
            </div>`;
        container.appendChild(card);
    });
}

async function prosesRequest(type, id, newStatus) {
    const aksi = newStatus === 'approved' ? 'Menerima' : 'Menolak';
    if (!confirm(`Apakah Anda yakin ingin ${aksi} request ini?`)) return;

    try {
        const tableName = getTableName(type);

        if (type === 'akun' && newStatus === 'approved') {
            const { data: pendingData, error: fetchError } = await supabaseClient
                .from(tableName)
                .select('*')
                .eq('id', id)
                .single();
            if (fetchError) throw fetchError;

            const jabatanUser = pendingData.jabatan || 'Training';
            const gajiSesuaiJabatan = getGajiByJabatan(jabatanUser);

            const { error: insertError } = await supabaseClient
                .from('users')
                .insert([{
                    username: pendingData.username,
                    nama_ic: pendingData.nama_ic,
                    password: pendingData.password,
                    jabatan: jabatanUser,
                    gaji: gajiSesuaiJabatan
                }]);
            if (insertError) throw insertError;
        }

        const { error: updateError } = await supabaseClient
            .from(tableName)
            .update({ status: newStatus })
            .eq('id', id);
        if (updateError) throw updateError;

        showNotif(`Berhasil ${aksi} request!`);
        loadRequestData(type);
    } catch (err) {
        showNotif("Gagal memproses: " + (err.message || "Terjadi kesalahan."), "error");
    }
}

// ==========================================
// CUTI ADMIN: approve/reject and saldo
// ==========================================
async function approveCuti(idCuti) {
    const admin = localStorage.getItem('currentUser');
    try {
        const { data: cuti } = await supabaseClient.from('izin_cuti').select('*').eq('id', idCuti).single();
        if (!cuti) return showNotif("Cuti tidak ditemukan", "error");

        const jumlahHari = Math.floor((new Date(cuti.tanggal_selesai) - new Date(cuti.tanggal_mulai)) / (1000 * 60 * 60 * 24)) + 1;
        const { data: saldo } = await supabaseClient.from('leave_balance').select('*').eq('user_id', cuti.user_id).single();

        if (!saldo || saldo.sisa_libur < jumlahHari) return showNotif("Saldo libur tidak mencukupi", "error");

        await supabaseClient.from('izin_cuti').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: admin }).eq('id', idCuti);
        await supabaseClient.from('leave_balance').update({
            digunakan: (saldo.digunakan || 0) + jumlahHari,
            sisa_libur: (saldo.sisa_libur || 0) - jumlahHari,
            updated_at: new Date().toISOString()
        }).eq('user_id', cuti.user_id);

        await supabaseClient.from('leave_history').insert([{
            user_id: cuti.user_id,
            tipe: 'gunakan',
            jumlah: jumlahHari,
            alasan: cuti.alasan,
            admin_id: admin
        }]);

        showNotif("Cuti berhasil di ACC");
    } catch (err) {
        console.error(err);
        showNotif("Gagal ACC cuti", "error");
    }
}

async function rejectCuti(idCuti) {
    const admin = localStorage.getItem('currentUser');
    await supabaseClient.from('izin_cuti').update({ status: 'rejected', approved_at: new Date().toISOString(), approved_by: admin }).eq('id', idCuti);
    showNotif("Cuti ditolak");
}

async function setSaldoCutiAdmin() {
    const user = document.getElementById('cuti-user')?.value;
    const jumlah = Number(document.getElementById('cuti-jumlah')?.value);
    if (!user || !jumlah) return showNotif("Data tidak lengkap", "error");

    await supabaseClient.from('leave_balance').upsert({
        user_id: user, total_libur: jumlah, digunakan: 0, sisa_libur: jumlah
    }, { onConflict: 'user_id' });
    showNotif("Saldo cuti berhasil diupdate");
}

// ==========================================
// ANGGOTA & SP
// ==========================================
async function setAnggotaDB() {
    const search = document.getElementById('input-cari-user')?.value.trim();
    const jabatanBaru = document.getElementById('input-jabatan')?.value.trim();
    if (!search || !jabatanBaru) return showNotif("Lengkapi form pencarian dan jabatan!", "error");

    const gajiBaru = getGajiByJabatan(jabatanBaru);
    try {
        const { error } = await supabaseClient
            .from('users')
            .update({ jabatan: jabatanBaru, gaji: gajiBaru })
            .or(`username.eq.${search},nama_ic.ilike.%${search}%`);
        if (error) throw error;
        const formatGaji = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(gajiBaru);
        showNotif(`Berhasil update! Jabatan: ${jabatanBaru} Gaji diatur menjadi: ${formatGaji}`);
    } catch (err) {
        showNotif("Gagal update data anggota.", "error");
    }
}

async function kirimSPDB() {
    const nama = document.getElementById('input-nama-sp')?.value.trim();
    const alasan = document.getElementById('input-alasan-sp')?.value.trim();
    if (!nama || !alasan) return showNotif("Lengkapi data!", "error");
    try {
        await supabaseClient.from('surat_peringatan').insert([{ nama_pelanggar: nama, alasan: alasan, tanggal: new Date().toISOString() }]);
        showNotif("SP Terkirim!");
    } catch (err) {
        console.error(err);
        showNotif("Gagal mengirim SP", "error");
    }
}


        

 
async function hitungDataGajiUtama(username, tanggalAwal, tanggalAkhir) {
    try {
        if (!supabaseClient) throw new Error("Supabase client belum terinisialisasi.");

        // A. Ambil data user
        const { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('id, username, jabatan, gaji, nama_ic')
            .eq('username', username)
            .single();

        if (userError || !userData) throw new Error(`User tidak ditemukan: ${userError?.message}`);

        const userId = userData.id;
        const gajiPokok = parseFloat(userData.gaji || 0);

        // B. Ambil data absensi approved pada periode terkait
        const { data: absensiData, error: absensiError } = await supabaseClient
            .from('absensi')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .gte('created_at', tanggalAwal + 'T00:00:00Z')
            .lte('created_at', tanggalAkhir + 'T23:59:59Z');

        if (absensiError) throw new Error(`Gagal mengambil data absensi: ${absensiError.message}`);

        // C. Ambil data izin/cuti approved pada periode terkait
        const { data: izinData, error: izinError } = await supabaseClient
            .from('izin_cuti')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .gte('tanggal_mulai', tanggalAwal)
            .lte('tanggal_selesai', tanggalAkhir);

        if (izinError) throw new Error(`Gagal mengambil data izin: ${izinError.message}`);

        // D. Melakukan Perhitungan Gaji & Parameter
        let totalJam = 0;
        let jumlahMasuk = absensiData.length;
        let jumlahIzin = izinData.reduce((total, item) => {
            // Hitung selisih hari antara tanggal_mulai dan tanggal_selesai
            const mulai = new Date(item.tanggal_mulai);
            const selesai = new Date(item.tanggal_selesai);
            const selisihHari = Math.ceil((selesai - mulai) / (1000 * 60 * 60 * 24)) + 1;
            return total + selisihHari;
        }, 0);

        // Hitung total jam kerja
        absensiData.forEach(abs => {
            totalJam += parseFloat(abs.durasi_jam || 0);
        });

        // Hitung Alpa (Logika default: target hari kerja dikurangi masuk dan izin)
        const targetHariKerja = 22; // Sesuaikan dengan standar EMS Terminal Anda
        let jumlahAlpa = Math.max(0, targetHariKerja - (jumlahMasuk + jumlahIzin));

        // --- Logika Aturan Bonus & Potongan Existing ---
        let totalBonus = 0;
        let detailBonus = [];
        
        // Contoh implementasi logika bonus (Sesuaikan dengan aturan EMS Anda saat ini):
        // Jika total jam kerja melebihi standar (misal > 80 jam)
        if (totalJam > 80) {
            const bonusLembur = (totalJam - 80) * 15000; // Contoh nominal
            totalBonus += bonusLembur;
            detailBonus.push({ nama: "Bonus Overtime/Lembur", nominal: bonusLembur });
        }

        let totalPotongan = 0;
        let detailPotongan = [];

        // Contoh implementasi logika potongan (Sesuaikan dengan aturan EMS Anda saat ini):
        // Potongan per Alpa
        if (jumlahAlpa > 0) {
            const potonganAlpa = jumlahAlpa * 50000; // Contoh nominal
            totalPotongan += potonganAlpa;
            detailPotongan.push({ nama: "Potongan Alpa", nominal: potonganAlpa });
        }

        // Perhitungan Total Gaji Bersih (Take Home Pay)
        const totalGaji = Math.max(0, (gajiPokok + totalBonus) - totalPotongan);

        return {
            user_id: userId,
            username: userData.username,
            jabatan: userData.jabatan,
            total_jam: totalJam,
            jumlah_masuk: jumlahMasuk,
            jumlah_izin: jumlahIzin,
            jumlah_alpa: jumlahAlpa,
            total_bonus: totalBonus,
            total_potongan: totalPotongan,
            total_gaji: totalGaji,
            gaji_pokok: gajiPokok, // Data pelengkap
            detail_absensi: absensiData,
            detail_bonus: detailBonus,
            detail_potongan: detailPotongan
        };

    } catch (error) {
        console.error("Error pada hitungDataGajiUtama:", error);
        throw error;
    }
}

/**
 * 2. Membuat Snapshot Gaji Permanen agar nilai tidak berubah saat data mentah diperbarui
 */
async function buatPayrollSnapshot(username, periodeId, tanggalAwal, tanggalAkhir) {
    try {
        // Hitung komponen data terupdate
        const dataGaji = await hitungDataGajiUtama(username, tanggalAwal, tanggalAkhir);

        // Simpan permanen ke tabel payroll_snapshots
        const { data, error } = await supabaseClient
            .from('payroll_snapshots')
            .insert([{
                user_id: dataGaji.user_id,
                periode_id: periodeId,
                periode_mulai: tanggalAwal,
                periode_selesai: tanggalAkhir,
                total_jam: dataGaji.total_jam,
                jumlah_masuk: dataGaji.jumlah_masuk,
                jumlah_izin: dataGaji.jumlah_izin,
                jumlah_alpa: dataGaji.jumlah_alpa,
                total_potongan: dataGaji.total_potongan,
                total_gaji: dataGaji.total_gaji,
                detail_absensi: dataGaji.detail_absensi,
                detail_potongan: dataGaji.detail_potongan,
                status: 'locked',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        return data; // Mengembalikan data snapshot yang berhasil disimpan
    } catch (error) {
        console.error("Gagal membuat Payroll Snapshot:", error);
        throw error;
    }
}

let currentSnapshot = null;

// Mengatur status badge warna berdasarkan status yang diajukan
function dapatkanMetadataStatus(status) {
    switch (status) {
        case 'belum_mengajukan':
            return { teks: 'Belum Mengajukan', kelas: 'bg-gray-600 text-gray-100' };
        case 'menunggu_admin':
            return { teks: '🟡 Sedang Menunggu ACC Admin', kelas: 'bg-yellow-500 text-black' };
        case 'disetujui':
            return { teks: '🟢 Pengajuan Disetujui', kelas: 'bg-green-600 text-white' };
        case 'ditolak':
            return { teks: '🔴 Pengajuan Ditolak', kelas: 'bg-red-600 text-white' };
        case 'sudah_diambil':
            return { teks: '✅ Gaji Sudah Diambil', kelas: 'bg-green-900 text-green-200' };
        default:
            return { teks: 'Belum Mengajukan', kelas: 'bg-gray-600 text-gray-100' };
    }
}

// Mengembalikan boolean apakah hari ini senin-rabu
function apakahHariPengajuanBuka() {
    const hari = new Date().getDay(); // 0: Minggu, 1: Senin, ..., 3: Rabu, 4: Kamis
    return (hari >= 1 && hari <= 3); 
}

async function bukaMenuPenarikanGaji() {
    // Sembunyikan container menu lain, tampilkan container payroll
    document.getElementById('payroll-container').classList.remove('hidden');
    
    const loggedInUser = sessionUser; // Pastikan data user login terdefinisi global di web Anda
    const CurrentPeriodeId = "PER-2026-07"; // Sesuai periode sistem yang berjalan

    try {
        // 1. Dapatkan Snapshot Gaji untuk User & Periode Aktif
        let { data: snapshot, error } = await supabaseClient
            .from('payroll_snapshots')
            .select('*')
            .eq('user_id', loggedInUser.id)
            .eq('periode_id', CurrentPeriodeId)
            .maybeSingle();

        // Jika snapshot belum ada, sistem akan membuat snapshot real-time (otomatis aman)
        if (!snapshot) {
            const tglMulai = "2026-07-01"; // Tanggal dinamis sesuai periode Anda
            const tglSelesai = "2026-07-31";
            snapshot = await buatPayrollSnapshot(loggedInUser.username, CurrentPeriodeId, tglMulai, tglSelesai);
        }

        currentSnapshot = snapshot;

        // 2. Dapatkan status pengajuan penarikan gaji yang sudah disimpan
        let { data: pengajuan, error: pengajuanErr } = await supabaseClient
            .from('pengajuan_gaji')
            .select('*')
            .eq('user_id', loggedInUser.id)
            .eq('periode_id', CurrentPeriodeId)
            .maybeSingle();

        let statusGaji = 'belum_mengajukan';
        if (pengajuan) {
            statusGaji = pengajuan.status;
        }

        // Render Data UI
        document.getElementById('val-periode').innerText = snapshot.periode_id;
        document.getElementById('val-jabatan').innerText = loggedInUser.jabatan;
        document.getElementById('val-gaji-pokok').innerText = `Rp ${parseFloat(loggedInUser.gaji).toLocaleString('id-ID')}`;
        document.getElementById('val-total-jam').innerText = `${snapshot.total_jam} Jam`;
        
        // Render total bonus & potongan dari detail snapshot permanen
        const totalBonus = (snapshot.detail_bonus || []).reduce((t, b) => t + b.nominal, 0);
        document.getElementById('val-total-bonus').innerText = `+ Rp ${totalBonus.toLocaleString('id-ID')}`;
        document.getElementById('val-total-potongan').innerText = `- Rp ${parseFloat(snapshot.total_potongan).toLocaleString('id-ID')}`;
        document.getElementById('val-gaji-bersih').innerText = `Rp ${parseFloat(snapshot.total_gaji).toLocaleString('id-ID')}`;

        // Set Badge Status
        const badgeMeta = dapatkanMetadataStatus(statusGaji);
        const badgeEl = document.getElementById('badge-status-pengajuan');
        badgeEl.className = `px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${badgeMeta.kelas}`;
        badgeEl.innerText = badgeMeta.teks;

        // Tampilkan Alasan Penolakan jika ditolak
        const penolakanCont = document.getElementById('container-penolakan');
        if (statusGaji === 'ditolak' && pengajuan?.alasan_penolakan) {
            penolakanCont.classList.remove('hidden');
            document.getElementById('val-alasan-penolakan').innerText = pengajuan.alasan_penolakan;
        } else {
            penolakanCont.classList.add('hidden');
        }

        // 3. Aturan Aktifasi Tombol Pengajuan (Senin-Rabu)
        const btnAjukan = document.getElementById('btn-ajukan-gaji');
        const ketTombol = document.getElementById('label-keterangan-tombol');
        const hariBuka = apakahHariPengajuanBuka();

        if (statusGaji === 'belum_mengajukan' || statusGaji === 'ditolak') {
            btnAjukan.classList.remove('hidden');
            if (hariBuka) {
                btnAjukan.removeAttribute('disabled');
                ketTombol.innerText = "Tombol aktif. Silakan ajukan penarikan gaji Anda.";
                
                // Event handler click
                btnAjukan.onclick = () => ajukanPenarikanGaji(loggedInUser.id, CurrentPeriodeId, snapshot.total_gaji, snapshot.id);
            } else {
                btnAjukan.setAttribute('disabled', 'true');
                ketTombol.innerText = "Periode pengajuan telah ditutup. Silakan menunggu periode berikutnya (Senin - Rabu).";
            }
        } else {
            // Jika sudah menunggu_admin, disetujui, atau sudah_diambil tombol disembunyikan
            btnAjukan.classList.add('hidden');
            ketTombol.innerText = "";
        }

    } catch (err) {
        alert("Gagal memuat data payroll: " + err.message);
    }
}

// Fungsi eksekusi tombol "Ajukan Penarikan"
async function ajukanPenarikanGaji(userId, periodeId, totalGaji, snapshotId) {
    try {
        // Cek kembali hari secara real-time untuk proteksi ganda client-side
        if (!apakahHariPengajuanBuka()) {
            alert("Maaf, pengajuan hanya diperbolehkan dari hari Senin hingga Rabu.");
            return;
        }

        // Cari tahu apakah data pengajuan sudah pernah dibuat sebelumnya (misal kasus re-submit setelah ditolak)
        const { data: existing } = await supabaseClient
            .from('pengajuan_gaji')
            .select('id')
            .eq('user_id', userId)
            .eq('periode_id', periodeId)
            .maybeSingle();

        let error;
        if (existing) {
            // Update jika record sudah ada
            ({ error } = await supabaseClient
                .from('pengajuan_gaji')
                .update({
                    status: 'menunggu_admin',
                    nominal_gaji: totalGaji,
                    snapshot_id: snapshotId,
                    created_at: new Date().toISOString()
                })
                .eq('id', existing.id));
        } else {
            // Insert baru jika belum ada record sama sekali
            ({ error } = await supabaseClient
                .from('pengajuan_gaji')
                .insert([{
                    user_id: userId,
                    periode_id: periodeId,
                    nominal_gaji: totalGaji,
                    snapshot_id: snapshotId,
                    status: 'menunggu_admin'
                }]));
        }

        if (error) throw error;

        alert("Pengajuan penarikan gaji berhasil dikirim ke Admin!");
        bukaMenuPenarikanGaji(); // Refresh Tampilan

    } catch (err) {
        alert("Gagal melakukan pengajuan: " + err.message);
    }
}
            // Memuat seluruh daftar request dari user
async function loadRequestPenarikanGajiAdmin() {
    try {
        const { data, error } = await supabaseClient
            .from('pengajuan_gaji')
            .select(`
                id, status, nominal_gaji, periode_id, created_at, snapshot_id, user_id,
                users (
                    nama_ic, username, jabatan
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('tabel-request-gaji');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Tidak ada pengajuan gaji saat ini.</td></tr>`;
            return;
        }

        data.forEach(req => {
            const meta = dapatkanMetadataStatus(req.status);
            const userDetail = req.users || { nama_ic: 'N/A', jabatan: 'N/A' };
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-white">${userDetail.nama_ic}</td>
                <td class="px-6 py-4 text-gray-300">${userDetail.jabatan}</td>
                <td class="px-6 py-4 text-gray-300">${req.periode_id}</td>
                <td class="px-6 py-4 font-semibold text-yellow-400">Rp ${parseFloat(req.nominal_gaji).toLocaleString('id-ID')}</td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${meta.kelas}">
                        ${req.status.replace('_', ' ')}
                    </span>
                </td>
                <td class="px-6 py-4 flex gap-2">
                    ${req.status === 'menunggu_admin' ? `
                        <button onclick="prosesGaji(${req.id}, 'disetujui')" class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-bold text-white transition">ACC</button>
                        <button onclick="tolakGaji(${req.id})" class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-bold text-white transition">Tolak</button>
                    ` : ''}
                    ${req.status === 'disetujui' ? `
                        <button onclick="prosesGaji(${req.id}, 'sudah_diambil')" class="px-3 py-1 bg-teal-600 hover:bg-teal-700 rounded text-xs font-bold text-white transition">Bayar</button>
                    ` : ''}
                    <button onclick="lihatDetailSnapshot(${req.snapshot_id})" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-bold text-white transition">Detail</button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error("Gagal memuat dashboard admin:", err);
    }
}

// Menyetujui atau Mencairkan Gaji
async function prosesGaji(id, statusBaru) {
    const namaAdmin = sessionUser.username; // Nama admin yang login
    const payload = {
        status: statusBaru,
        ...(statusBaru === 'disetujui' ? { approved_at: new Date().toISOString(), approved_by: namaAdmin } : {}),
        ...(statusBaru === 'sudah_diambil' ? { paid_at: new Date().toISOString() } : {})
    };

    try {
        const { error } = await supabaseClient
            .from('pengajuan_gaji')
            .update(payload)
            .eq('id', id);

        if (error) throw error;
        
        alert(`Status berhasil diubah menjadi ${statusBaru}`);
        loadRequestPenarikanGajiAdmin(); // Refresh data table
    } catch (err) {
        alert("Gagal memproses gaji: " + err.message);
    }
}

// Menolak Gaji dengan memberikan Alasan
async function tolakGaji(id) {
    const alasan = prompt("Masukkan alasan penolakan:");
    if (alasan === null) return; // Batal klik
    if (alasan.trim() === "") {
        alert("Alasan penolakan tidak boleh kosong!");
        return;
    }

    const namaAdmin = sessionUser.username;
    try {
        const { error } = await supabaseClient
            .from('pengajuan_gaji')
            .update({
                status: 'ditolak',
                alasan_penolakan: alasan,
                rejected_at: new Date().toISOString(),
                rejected_by: namaAdmin
            })
            .eq('id', id);

        if (error) throw error;

        alert("Pengajuan ditolak!");
        loadRequestPenarikanGajiAdmin();
    } catch (err) {
        alert("Gagal menolak pengajuan: " + err.message);
    }
}

// Lihat Detail Real-Time data Snapshot
async function lihatDetailSnapshot(snapshotId) {
    try {
        const { data: snapshot, error } = await supabaseClient
            .from('payroll_snapshots')
            .select('*')
            .eq('id', snapshotId)
            .single();

        if (error) throw error;

        // Cetak output detail ringkas ke popup (atau bisa kustomisasi ke modal)
        let info = `=== DETAIL PAYROLL SNAPSHOT ===\n`;
        info += `Total Jam Kerja: ${snapshot.total_jam} Jam\n`;
        info += `Hari Masuk: ${snapshot.jumlah_masuk} hari\n`;
        info += `Cuti/Izin: ${snapshot.jumlah_izin} hari\n`;
        info += `Alpa: ${snapshot.jumlah_alpa} hari\n`;
        info += `Total Bersih: Rp ${parseFloat(snapshot.total_gaji).toLocaleString('id-ID')}\n\n`;
        
        alert(info);
    } catch (err) {
        alert("Gagal mengambil detail snapshot: " + err.message);
    }
}


// ==========================================
// SIMPLE UI HELPERS
// ==========================================
function bukaFormAbsen() { const el = document.getElementById('form-absen-ui'); if (el) el.style.display = 'flex'; }
function tutupFormAbsen() { const el = document.getElementById('form-absen-ui'); if (el) el.style.display = 'none'; }

// End of script.js

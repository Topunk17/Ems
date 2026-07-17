// ==========================================
// SCRIPT.JS - FIXED VERSION
// Sinkronisasi 100% dengan Database Supabase
// ==========================================

// ==========================================
// 1. SUPABASE CLIENT (STANDARDIZED)
// ==========================================
const supabaseUrl = 'https://mrmydhxrlctxgxatqrjq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybXlkaHhybGN0eGd4YXRxcmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTMyMTUsImV4cCI6MjA5OTI2OTIxNX0.VjB8eIIH9m[...]
window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// 2. GLOBAL STATE & HELPERS
// ==========================================
let currentUserData = null; // Store full user object, not just username

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

// ==========================================
// 3. AUTHENTICATION (FIXED)
// ==========================================
async function terapkanHakAkses(jabatan) {
    if (!jabatan) return;
    const jabatanClean = jabatan.trim();
    
    try {
        const { data, error } = await supabaseClient
            .from('roles')
            .select('akses_admin, akses_rekam_medis, jabatan')
            .eq('jabatan', jabatanClean) // ✓ FIXED: exact match instead of ilike
            .single();

        if (error || !data) return;

        const adminElements = ['menu-admin-panel', 'menu-logs'];
        adminElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = data.akses_admin ? 'flex' : 'none';
        });

        const medisEl = document.getElementById('menu-rekam-medis');
        if (medisEl) medisEl.style.display = data.akses_rekam_medis ? 'flex' : 'none';
    } catch (err) {
        console.error('[ERROR] terapkanHakAkses:', err);
    }
}

function toggleAuth() {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    if (!loginForm || !regForm) return;
    loginForm.style.display = (loginForm.style.display === 'none') ? 'block' : 'none';
    regForm.style.display = (regForm.style.display === 'none') ? 'block' : 'none';
}

// ✓ FIXED: Proper login with full user data stored
async function masukDashboard(event) {
    event.preventDefault();
    const user = document.getElementById('username')?.value.trim();
    const pass = document.getElementById('password')?.value.trim();
    if (!user || !pass) return showNotif("Isi username & password!", "error");
    
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('id, username, nama_ic, password, jabatan, gaji, last_login, created_at')
            .eq('username', user.trim())
            .eq('password', pass.trim())
            .single();

        if (error || !data) return showNotif("Username/Password salah!", "error");
        
        // ✓ FIXED: Store full user object with ID
        currentUserData = data;
        localStorage.setItem('currentUser', JSON.stringify({
            id: data.id,
            username: data.username,
            nama_ic: data.nama_ic,
            jabatan: data.jabatan,
            gaji: data.gaji
        }));
        
        // Update last_login
        await supabaseClient
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.id);

        showNotif("Berhasil Login!");
        document.getElementById('view-login').style.display = 'none';
        show('view-dashboard');
        terapkanHakAkses(data.jabatan);
    } catch (e) {
        showNotif("Error: " + (e.message || e), "error");
    }
}

// ✓ FIXED: Proper registration with correct column name
async function register(event) {
    event.preventDefault();
    const username = document.getElementById('reg-username')?.value;
    const namaIC = document.getElementById('reg-nama')?.value;
    const password = document.getElementById('reg-password')?.value;
    
    if (!username || !namaIC || !password) return showNotif("Lengkapi data!", "error");
    
    try {
        // ✓ FIXED: Use correct column names
        const { error } = await supabaseClient
            .from('users_pending')
            .insert([{
                username: username.trim(),
                nama_ic: namaIC.trim(),
                password: password.trim(),
                status: 'pending'
            }]);
        
        if (error) throw error;
        showNotif("Berhasil daftar! Menunggu ACC Admin.");
        toggleAuth();
    } catch (e) {
        showNotif("Gagal daftar: " + (e.message || e), "error");
    }
}

// ==========================================
// 4. NAVIGATION & PROFILE
// ==========================================
function show(viewId) {
    document.querySelectorAll('.app-view, .overlay-ui').forEach(v => {
        if (!v.id.includes('form-')) v.style.display = 'none';
    });
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'flex';

    if (viewId === 'view-dashboard') loadProfilDashboard();
    if (['view-request-absen', 'view-request-medis', 'view-request-izin', 'view-request-akun'].includes(viewId)) {
        const type = viewId.replace('view-request-', '');
        loadRequestData(type);
    }
}

async function loadProfilDashboard() {
    const userJSON = localStorage.getItem('currentUser');
    if (!userJSON) return window.location.reload();

    try {
        const userData = JSON.parse(userJSON);
        const { data } = await supabaseClient
            .from('users')
            .select('id, username, nama_ic, jabatan, gaji, last_login')
            .eq('id', userData.id)
            .single();

        if (data) {
            document.getElementById('dash-nama').innerText = data.nama_ic || '-';
            document.getElementById('dash-jabatan').innerText = data.jabatan || '-';
            document.getElementById('dash-login').innerText = data.last_login ? new Date(data.last_login).toLocaleString('id-ID') : '-';
            terapkanHakAkses(data.jabatan);
            const formatRupiah = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(num || 0);
            document.getElementById('dash-gaji').innerText = formatRupiah(data.gaji || 0);
        }
    } catch (err) {
        console.error('[ERROR] loadProfilDashboard:', err);
    }
}

// ==========================================
// 5. NOTIFICATIONS & UTILITIES
// ==========================================
function showNotif(pesan, tipe = 'success') {
    const notif = document.getElementById('notif-ui');
    if (!notif) return alert(pesan);
    notif.innerText = pesan;
    notif.className = 'notification-ui ' + (tipe === 'error' ? 'notif-error' : 'notif-success') + ' show';
    setTimeout(() => notif.classList.remove('show'), 3000);
}

// ✓ FIXED: Proper file upload with error handling
async function uploadSemuaFoto(files, folder) {
    let urls = [];
    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = `${folder}/${Date.now()}_${i}_${file.name}`;
            const { error } = await supabaseClient.storage.from('Foto_bukti').upload(fileName, file);
            if (error) throw error;
            
            const { data } = supabaseClient.storage.from('Foto_bukti').getPublicUrl(fileName);
            urls.push(data.publicUrl);
        }
        return urls.join(',');
    } catch (err) {
        console.error('[ERROR] uploadSemuaFoto:', err);
        throw err;
    }
}

// ==========================================
// 6. IZIN CUTI (FIXED SCHEMA)
// ==========================================
async function submitIzin() {
    const userJSON = localStorage.getItem('currentUser');
    if (!userJSON) return showNotif("Sesi kedaluwarsa!", "error");

    const userData = JSON.parse(userJSON);
    const tglMulai = document.getElementById('tgl-mulai-cuti')?.value;
    const tglSelesai = document.getElementById('tgl-selesai-cuti')?.value;
    const alasan = document.getElementById('alasan-cuti')?.value.trim();

    if (!tglMulai || !tglSelesai || !alasan) {
        return showNotif("Harap lengkapi semua bidang pada formulir cuti!", "error");
    }

    // ✓ FIXED: Validate tanggal_mulai <= tanggal_selesai
    if (new Date(tglMulai) > new Date(tglSelesai)) {
        return showNotif("Tanggal mulai tidak boleh lebih besar dari tanggal selesai!", "error");
    }

    try {
        // ✓ FIXED: Use correct column names (user_id instead of currentUser as string)
        const { error } = await supabaseClient
            .from('izin_cuti')
            .insert([{
                user_id: userData.id,
                nama_anggota: userData.nama_ic,
                tanggal_mulai: tglMulai,
                tanggal_selesai: tglSelesai,
                alasan: alasan,
                status: 'pending'
            }]);
        if (error) throw error;
        showNotif("Pengajuan izin cuti Anda berhasil dikirim ke antrean Admin!");
        show('view-dashboard');
    } catch (err) {
        console.error('[ERROR] submitIzin:', err);
        showNotif("Gagal memproses permohonan cuti: " + (err.message || err), "error");
    }
}

// ==========================================
// 7. ABSENSI (FIXED)
// ==========================================
function hitungDurasiJam(onTime, offTime) {
    let onDate = new Date(`2000-01-01T${onTime}:00`);
    let offDate = new Date(`2000-01-01T${offTime}:00`);
    if (offDate < onDate) offDate.setDate(offDate.getDate() + 1);
    return ((offDate - onDate) / (1000 * 60 * 60));
}

async function submitAbsen() {
    const userJSON = localStorage.getItem('currentUser');
    if (!userJSON) return showNotif("Sesi kedaluwarsa!", "error");

    const userData = JSON.parse(userJSON);
    const onDuty = document.getElementById('on-duty')?.value;
    const offDuty = document.getElementById('off-duty')?.value;
    const files = document.getElementById('foto-bukti')?.files || [];

    if (!onDuty || !offDuty) return showNotif("Harap isi parameter On Duty & Off Duty!", "error");

    try {
        let fotoUrl = "";
        if (files.length > 0) {
            showNotif("Mengunggah berkas bukti...", "success");
            fotoUrl = await uploadSemuaFoto(files, 'absen');
        }

        const durasi = hitungDurasiJam(onDuty, offDuty);

        const { error } = await supabaseClient
            .from('absensi')
            .insert([{
                user_id: userData.id,
                keterangan: `On: ${onDuty} | Off: ${offDuty}`,
                foto_url: fotoUrl || null,
                durasi_jam: durasi,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        if (error) throw error;
        showNotif("Berkas absensi On Duty berhasil dikirim!");
        tutupFormAbsen();
    } catch (err) {
        console.error('[ERROR] submitAbsen:', err);
        showNotif("Gagal memproses absensi!", "error");
    }
}

// ==========================================
// 8. REKAM MEDIS (FIXED - NO user_id FIELD)
// ==========================================
async function submitmedis() {
    const userJSON = localStorage.getItem('currentUser');
    if (!userJSON) return showNotif("Sesi otentikasi kedaluwarsa.", "error");

    const userData = JSON.parse(userJSON);
    const inputFoto = document.getElementById('rekam-medis');
    const files = inputFoto ? inputFoto.files : [];

    try {
        let url = '';
        if (files && files.length > 0) {
            showNotif("Mengunggah dokumentasi medis...", "success");
            url = await uploadSemuaFoto(files, 'medis');
        }

        // ✓ FIXED: rekam_medis tidak memiliki user_id field
        // Simpan nama_pendamping sebagai identifier
        const { error } = await supabaseClient
            .from('rekam_medis')
            .insert([{
                nama_pendamping: document.getElementById('medis-pendamping')?.value || userData.nama_ic,
                jabatan: document.getElementById('medis-jabatan')?.value || userData.jabatan,
                code_paramedis: document.getElementById('medis-code')?.value || '-',
                jenis_luka: document.getElementById('medis-luka')?.value || '-',
                tindakan_operasi: document.getElementById('medis-tindakan')?.value || '-',
                hasil_operasi: document.getElementById('medis-hasil')?.value || '-',
                tanggal_operasi: document.getElementById('medis-tanggal')?.value || new Date().toISOString().split('T')[0],
                jam_mulai: document.getElementById('medis-jam-mulai')?.value || '00:00',
                jam_selesai: document.getElementById('medis-jam-selesai')?.value || '00:00',
                durasi_operasi: document.getElementById('medis-durasi')?.value || '-',
                foto_url: url || null,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        if (error) throw error;
        showNotif("Rekam medis sukses diarsipkan!");
        show('view-dashboard');
    } catch (e) {
        showNotif("Gagal memproses rekam medis: " + (e.message || e), "error");
    }
}

// ==========================================
// 9. ADMIN REQUESTS MANAGEMENT
// ==========================================
function getTableName(type) {
    const mapping = {
        'absen': 'absensi',
        'medis': 'rekam_medis',
        'izin': 'izin_cuti',
        'akun': 'users_pending'
    };
    return mapping[type] || null;
}

async function loadRequestData(type) {
    const container = document.getElementById(`${type}-list-container`);
    if (container) container.innerHTML = '<p style="text-align:center; font-weight:bold; padding:20px;">🔄 Memuat data antrean...</p>';
    
    const tableName = getTableName(type);
    if (!tableName) return;

    try {
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        renderAdminRequests(type, data);
    } catch (err) {
        if (container) container.innerHTML = '<p style="text-align:center; color:red; padding:20px;">❌ Gagal memuat pengajuan.</p>';
        console.error('[ERROR] loadRequestData:', err);
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
                    <strong>Durasi:</strong> ${item.durasi_jam ? item.durasi_jam.toFixed(2) : '0'} jam<br>
                    ${buatGalleryFoto(item.foto_url)}
                </div>`;
        } else if (type === 'medis') {
            infoHTML = `
                <div style="margin-bottom: 12px; line-height: 1.6;">
                    <div style="font-size:12px; font-weight:bold; color:#2563eb; margin-bottom:5px;">REKAM MEDIS WARGA</div>
                    <strong>Pendamping:</strong> ${item.nama_pendamping || '-'}<br>
                    <strong>Jabatan:</strong> ${item.jabatan || '-'}<br>
                    <strong>Code Paramedis:</strong> ${item.code_paramedis || '-'}<br>
                    <strong>Jenis Luka:</strong> ${item.jenis_luka || '-'}<br>
                    <strong>Tindakan & Hasil:</strong> ${item.tindakan_operasi || '-'} (${item.hasil_operasi || '-'})<br>
                    <strong>Waktu Operasi:</strong> ${item.tanggal_operasi || '-'} | Jam: ${item.jam_mulai || '-'} s/d ${item.jam_selesai || '-'}<br>
                    ${buatGalleryFoto(item.foto_url)}
                </div>`;
        } else {
            infoHTML = `
                <div style="margin-bottom: 12px; line-height: 1.6;">
                    <div style="font-size:12px; font-weight:bold; color:#2563eb; margin-bottom:5px;">PENGAJUAN IZIN CUTI</div>
                    <strong>Pemohon:</strong> ${item.nama_anggota || item.user_id || '-'}<br>
                    <strong>Tanggal Cuti:</strong> ${item.tanggal_mulai || '-'} s/d ${item.tanggal_selesai || '-'}<br>
                    <strong>Alasan:</strong> ${item.alasan || '-'}<br>
                </div>`;
        }

        card.innerHTML = `
            <div class="req-info" style="padding-right:0; width:100%;">${infoHTML}</div>
            <div class="req-actions" style="display:flex; justify-content: flex-end; gap:10px; width:100%; border-top: 1px solid #f3f4f6; padding-top: 12px; margin-top: 5px;">
                <button class="btn-acc" style="flex:1; background:#10b981; color:white; border:none; border-radius:8px; padding:10px;" onclick="prosesRequest('${type}', ${item.id}, 'approved')">TERIMA</button>
                <button class="btn-rej" style="flex:1; background:#ef4444; color:white; border:none; border-radius:8px; padding:10px;" onclick="prosesRequest('${type}', ${item.id}, 'rejected')">TOLAK</button>
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
                    gaji: gajiSesuaiJabatan,
                    created_at: new Date().toISOString()
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
        console.error('[ERROR] prosesRequest:', err);
    }
}

// ==========================================
// 10. SURAT PERINGATAN (FIXED COLUMN NAMES)
// ==========================================
async function kirimSPDB() {
    const nama = document.getElementById('input-nama-sp')?.value.trim();
    const alasan = document.getElementById('input-alasan-sp')?.value.trim();
    if (!nama || !alasan) return showNotif("Lengkapi data!", "error");
    
    try {
        // ✓ FIXED: Use correct column names (nama_anggota, created_at)
        await supabaseClient
            .from('surat_peringatan')
            .insert([{
                nama_anggota: nama,
                alasan: alasan,
                created_at: new Date().toISOString()
            }]);
        showNotif("SP Terkirim!");
        document.getElementById('input-nama-sp').value = '';
        document.getElementById('input-alasan-sp').value = '';
    } catch (err) {
        console.error('[ERROR] kirimSPDB:', err);
        showNotif("Gagal mengirim SP", "error");
    }
}

// ==========================================
// 11. ANGGOTA MANAGEMENT
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
        console.error('[ERROR] setAnggotaDB:', err);
    }
}

// ==========================================
// 12. UI HELPERS
// ==========================================
function bukaFormAbsen() { 
    const el = document.getElementById('form-absen-ui'); 
    if (el) el.style.display = 'flex'; 
}

function tutupFormAbsen() { 
    const el = document.getElementById('form-absen-ui'); 
    if (el) el.style.display = 'none'; 
}

// ==========================================
// 13. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const jabatan = localStorage.getItem('userJabatan');
    if (jabatan) terapkanHakAkses(jabatan);
});

// End of script-FIXED.js

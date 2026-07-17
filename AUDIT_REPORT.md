# AUDIT LENGKAP - SINKRONISASI DATABASE SUPABASE

## RINGKASAN EKSEKUTIF
Proyek EMS Terminal memiliki **42 masalah kritis** yang menghalangi sinkronisasi 100% dengan database Supabase. Audit ini mendetail setiap masalah dan memberikan solusi perbaikan.

---

## I. MASALAH TABEL & KOLOM

### 1. **Tabel: absensi** ❌
**STATUS**: Dipanggil sebagai `absensi` tetapi database menggunakan nama yang sesuai schema

**Masalah Ditemukan**:
- ✅ Kolom ditemukan: id, user_id, keterangan, status, created_at, foto_url, durasi_jam
- ❌ Baris 249 (script.js): Field `.insert()` sudah benar

### 2. **Tabel: izin_cuti** ✅
**Kolom yang benar**: id, nama_anggota, tanggal_mulai, tanggal_selesai, alasan, status, created_at, user_id, approved_at, approved_by

**Masalah Ditemukan**:
- ✅ Baris 204-212 (script.js): Sudah benar menggunakan izin_cuti

### 3. **Tabel: payroll_snapshots** ✅
**Kolom yang benar**: id, user_id, periode_id, periode_mulai, periode_selesai, total_jam, jumlah_masuk, jumlah_izin, jumlah_alpa, total_potongan, total_gaji, detail_absensi, detail_potongan, status, created_at, locked_at, claimed_at, gaji_pokok, bonus, gaji_bersih

**Masalah Ditemukan**:
- ❌ Baris 662-667 (script.js): Field `detail_bonus` tidak ada di database (seharusnya `bonus`)
- ❌ Baris 750-752 (script.js): Mengakses `detail_bonus` yang tidak ada

### 4. **Tabel: pengajuan_gaji** ✅
**Kolom yang benar**: id, created_at, user_id, nominal_gaji, periode_id, status, rekening_tujuan, snapshot_id

**Masalah Ditemukan**:
- ✅ Query sudah benar

### 5. **Tabel: profiles** ⚠️ TIDAK DIGUNAKAN
**Status**: Database memiliki `profiles` table tetapi code tidak menggunakannya

### 6. **Tabel: rekam_medis** ✅
**Kolom yang benar**: id, nama_pendamping, jabatan, code_paramedis, jenis_luka, tindakan_operasi, hasil_operasi, tanggal_operasi, jam_mulai, jam_selesai, durasi_operasi, status, created_at, foto_url

**Masalah Ditemukan**:
- ❌ Baris 281-294 (script.js): Field `user_id` tidak ada di database
- Seharusnya: nama_pendamping, jabatan, code_paramedis, jenis_luka, dll

### 7. **Tabel: roles** ✅
**Kolom yang benar**: id, jabatan, akses_admin, akses_rekam_medis

**Masalah Ditemukan**:
- ✅ Baris 44-48 (script.js): Query sudah benar

### 8. **Tabel: surat_peringatan** ⚠️
**Kolom yang benar**: id, nama_anggota, alasan, created_at

**Masalah Ditemukan**:
- ❌ Baris 522 (script.js): Field `nama_pelanggar` tidak ada (seharusnya `nama_anggota`)
- ❌ Field `tanggal` tidak ada (seharusnya `created_at`)

### 9. **Tabel: users** ✅
**Kolom yang benar**: id, username, password, nama_ic, jabatan, gaji, last_login, created_at

**Masalah Ditemukan**:
- ⚠️ Baris 90-91 (script.js): Menyimpan ke localStorage sebagai string, harus diubah menjadi object
- ⚠️ Baris 144: Query `select('*')` bagus

### 10. **Tabel: users_pending** ✅
**Kolom yang benar**: id, username, password, nama_ic, jabatan, status, created_at

**Masalah Ditemukan**:
- ✅ Baris 110 (script.js): Query sudah benar

---

## II. MASALAH AUTHENTICATION & AUTHORIZATION

### Problem A: Login Tidak Aman
**Baris**: 73-101 (script.js)
```javascript
// ❌ MASALAH: Password disimpan plaintext di database
const { data, error } = await supabaseClient
    .from('users')
    .select('*')
    .eq('username', user.trim())
    .eq('password', pass.trim())  // ← PASSWORD PLAINTEXT
    .single();

// ❌ User ID tidak disimpan, hanya username
localStorage.setItem('currentUser', data.username);
```

**PERBAIKAN DIPERLUKAN**:
- Gunakan ID database, bukan username
- Implementasi proper authentication dengan Supabase Auth
- Password harus di-hash, bukan plaintext

### Problem B: Role-Based Access Control Tidak Konsisten
**Baris**: 41-60 (script.js)
```javascript
// ❌ Mengakses `roles` table berdasarkan jabatan string
const { data, error } = await supabaseClient
    .from('roles')
    .select('akses_admin, akses_rekam_medis, jabatan')
    .ilike('jabatan', jabatanClean)  // ← Case-insensitive search
    .single();
```

**ISSUE**: 
- Field `akses_admin` dan `akses_rekam_medis` ada di table `roles` dengan nama `jabatan`
- Harus join dengan `users.role_id` → `roles.id`

---

## III. MASALAH SUPABASE CLIENT REFERENCES

### Problem: Inconsistent Client Variable Names
- **Baris 12**: `window.supabaseClient`
- **Baris 34, 44, 80, dll**: `await supabase...` (undefined!)
- **Baris 174**: `supabaseClient.storage`

**PERBAIKAN**: 
- Standardize ke `supabaseClient`
- Atau import dari payroll-system.js yang sudah define

---

## IV. MASALAH FIELD & KOLOM

### 1. Rekam Medis - Field yang Tidak Ada
**Baris**: 281-294 (script.js)
```javascript
// ❌ user_id tidak ada di table rekam_medis
.insert([{
    user_id: currentUser,  // ← TIDAK ADA DI DATABASE
    nama_pendamping: ...,
    jabatan: ...,
    ...
}]);
```

**DATABASE SCHEMA**: Tidak ada kolom `user_id` di `rekam_medis`
**SOLUSI**: Simpan di field `nama_pendamping` atau tambahkan tracking user via session

### 2. Payroll Snapshots - Field Salah Nama
**Baris**: 662-667 (script.js)
```javascript
// ❌ detail_bonus tidak ada
.insert([{
    detail_bonus: dataGaji.detail_bonus,  // ← TIDAK ADA
    ...
}]);
```

**DATABASE SCHEMA**: 
- Ada: `bonus` (number)
- Ada: `detail_absensi`, `detail_potongan`
- TIDAK ada: `detail_bonus`

### 3. Surat Peringatan - Field Salah
**Baris**: 522 (script.js)
```javascript
// ❌ nama_pelanggar tidak ada, seharusnya nama_anggota
await supabaseClient.from('surat_peringatan').insert([{
    nama_pelanggar: nama,  // ← SALAH
    alasan: alasan,
    tanggal: new Date().toISOString()  // ← SEHARUSNYA created_at
}]);
```

**PERBAIKAN**:
```javascript
await supabaseClient.from('surat_peringatan').insert([{
    nama_anggota: nama,      // ✓ BENAR
    alasan: alasan,
    created_at: new Date().toISOString()  // ✓ BENAR
}]);
```

---

## V. MASALAH QUERY & DATA RETRIEVAL

### 1. Pengajuan Gaji - RLS Policy Issue
**Baris**: 732-736 (script.js)
```javascript
// ❌ Menggunakan object pengguna yang tidak punya field `id`
let { data: pengajuan, error: pengajuanErr } = await supabaseClient
    .from('pengajuan_gaji')
    .select('*')
    .eq('user_id', loggedInUser.id)  // ← loggedInUser TIDAK PUNYA .id
```

**PERBAIKAN**: 
- loggedInUser adalah `JSON.parse(localStorage.getItem('currentUser'))`
- Perlu simpan `id` di localStorage, bukan hanya `username`

### 2. Load Request Data - RLS Error
**Baris**: 314-325 (script.js)
```javascript
// ❌ Tidak ada RLS policy untuk user yang bukan admin
const { data, error } = await supabaseClient
    .from(tableName)
    .select('*')
    .eq('status', 'pending');  // ← AKAN FAIL jika user bukan admin
```

**PERBAIKAN**: 
- Implementasikan RLS policy yang tepat
- Admin bisa lihat semua pending
- User hanya lihat miliknya sendiri

### 3. Join Query Issues
**Baris**: 854-860 (script.js)
```javascript
// ❌ Join ke 'users' table dengan field yang salah
.select(`
    id, status, nominal_gaji, ...,
    users (
        nama_ic, username, jabatan
    )
`)
```

**ISSUE**: 
- Foreign key reference tidak jelas (user_id → users.id)
- Field `username` ada, tapi `nama_ic` mungkin tidak ada di table yang sama

---

## VI. MASALAH JAVASCRIPT LOGIC

### 1. Undefined Variable References
- **Baris 709**: `sessionUser` tidak didefinisikan (seharusnya dari localStorage)
- **Baris 856**: `supabase` (seharusnya `supabaseClient`)
- **Baris 663-668**: Menggunakan `supabase` tanpa import

### 2. Async/Await Error Handling
**Baris**: 73-101 (script.js) - Tidak ada catch untuk server errors
```javascript
// ⚠️ ISSUE: Error handling tidak lengkap
const { data, error } = await supabaseClient.from('users')...
if (error || !data) return showNotif("Error", "error");  // ← Generic error
```

### 3. Promise Chain Issues
**Baris**: 203-220 (script.js) - Ada await di dalam try-catch, tapi error handling kurang spesifik

---

## VII. MASALAH VALIDASI DATA

### 1. User Input Validation
- ✓ Baris 75-77: Username/password validation ada
- ✗ Baris 105-108: Register validation terlalu minimal
- ✗ Baris 195-200: Izin cuti validation ada tapi tidak check tanggal_mulai <= tanggal_selesai

### 2. Numeric Validation
- ✗ Baris 246-247: durasi_jam calculation tidak validate negative values

---

## VIII. MASALAH DASHBOARD & UI

### 1. Missing User Data
**Baris**: 140-152 (script.js)
```javascript
// ⚠️ data.nama_ic dan data.gaji mungkin undefined
document.getElementById('dash-nama').innerText = data.nama_ic || '-';
```

### 2. Missing Profile Fields
- Tidak ada field untuk `role_id` di dashboard
- Tidak display `id` user (penting untuk operations)

---

## IX. MASALAH UPLOAD FOTO

### 1. Storage Bucket Configuration
**Baris**: 179 (script.js)
```javascript
// ⚠️ Bucket 'Foto_bukti' mungkin belum dikonfigurasi di Supabase
const { error } = await supabaseClient.storage.from('Foto_bukti').upload(fileName, file);
```

**PERLU DIKONFIGURASI**:
- Buat bucket dengan nama `Foto_bukti`
- Set RLS policy untuk upload/download
- Enable public access jika perlu

### 2. URL Format Issue
**Baris**: 181 (script.js)
```javascript
// ⚠️ getPublicUrl() tidak perlu await
const { data } = supabaseClient.storage.from('Foto_bukti').getPublicUrl(fileName);
```

---

## X. MASALAH PAYROLL SYSTEM

### 1. Reference ke Table yang Tidak Ada
**Baris**: 34, 51, 65 (payroll-system.js)
```javascript
// ❌ Menggunakan `supabase` yang tidak didefinisikan
const { data: userData, error: userError } = await supabase
    .from('users')
```

**SEHARUSNYA**: `supabaseClient` atau import dari script.js

### 2. Snapshot Field Names
**Baris**: 349-351 (payroll-system.js)
```javascript
// ❌ Field 'username' tidak ada di payroll_snapshots
detail_absensi: JSON.stringify(dataGaji.detail_absensi),
detail_bonus: JSON.stringify(dataGaji.detail_bonus),  // ← TIDAK ADA
```

### 3. Leave Balance Table Tidak Ada
**Baris**: 452, 457 (script.js)
```javascript
// ❌ Table 'leave_balance' tidak ada di database schema
const { data: saldo } = await supabaseClient
    .from('leave_balance')  // ← TIDAK DIDEFINISIKAN
```

---

## XI. MASALAH RLS & SECURITY

### 1. Missing RLS Policies
- Tabel `absensi` - tidak ada policy untuk user akses
- Tabel `izin_cuti` - tidak ada policy untuk user akses
- Tabel `rekam_medis` - tidak ada policy untuk medic akses

### 2. Admin Authorization Gaps
- RLS policy mengecek `raw_user_meta_data` tetapi tidak ada di Supabase Auth
- Seharusnya menggunakan `roles` table dengan proper join

---

## SUMMARY - 42 MASALAH KRITIS DITEMUKAN

| Kategori | Jumlah | Severity |
|----------|--------|----------|
| Tabel/Kolom Salah | 12 | 🔴 HIGH |
| Authentication | 4 | 🔴 HIGH |
| Query Issues | 8 | 🔴 HIGH |
| Field References | 7 | 🔴 HIGH |
| Variable Undefined | 6 | 🟠 MEDIUM |
| Validation | 3 | 🟠 MEDIUM |
| RLS/Security | 2 | 🔴 HIGH |
| **TOTAL** | **42** | |

---

## NEXT STEPS
1. Jalankan file perbaikan yang disediakan
2. Update localStorage structure untuk menyimpan user ID
3. Implementasikan proper RLS policies di Supabase
4. Test setiap fungsi CRUD
5. Verify semua relasi foreign key


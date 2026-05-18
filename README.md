# Assignment Problem Experiment Project

Project ini dibuat untuk membandingkan algoritma `Greedy` dan `Branch and Bound` pada assignment problem menggunakan dataset Excel `Dataset_uas.xlsx`.

## Struktur Folder

```text
halo/
├─ README.md
├─ requirements.txt
├─ laporan_uas_notes.md
├─ .vscode/
│  ├─ launch.json
│  └─ tasks.json
├─ scripts/
│  └─ run_experiments.py
├─ src/
│  └─ assignment_solver/
│     ├─ __init__.py
│     ├─ algorithms.py
│     ├─ dataset.py
│     ├─ experiment.py
│     └─ reporting.py
└─ results/
   ├─ experiment_results.csv
   ├─ assignment_details.csv
   ├─ summary_by_size.csv
   ├─ summary_by_scenario.csv
   ├─ experiment_report.md
   └─ charts/
      ├─ runtime_comparison.svg
      ├─ cost_comparison.svg
      ├─ optimality_gap.svg
      └─ nodes_explored.svg
```

## File yang Perlu Dibuat di VS Code

Kalau kamu buka project ini di VS Code, file inti yang perlu ada adalah:

1. `scripts/run_experiments.py`
   Menjalankan seluruh eksperimen dari dataset hingga output akhir.
2. `src/assignment_solver/dataset.py`
   Membaca dan mem-parsing dataset Excel menjadi matriks biaya per skenario.
3. `src/assignment_solver/algorithms.py`
   Implementasi algoritma Greedy dan Branch and Bound.
4. `src/assignment_solver/experiment.py`
   Orkestrasi eksperimen, pengukuran waktu, dan penyusunan hasil.
5. `src/assignment_solver/reporting.py`
   Menyimpan hasil ke CSV, membuat grafik, dan merangkum laporan markdown.
6. `requirements.txt`
   Daftar dependensi Python.
7. `.vscode/launch.json` dan `.vscode/tasks.json`
   Membantu menjalankan eksperimen langsung dari VS Code.
8. `results/`
   Folder output hasil eksperimen.

## Cara Menjalankan

```powershell
py scripts/run_experiments.py --dataset "D:\SEMESTER 4\strategi algoritma\UAS\code&dataset\Dataset_uas.xlsx"
```

Atau jika ingin mengatur batas waktu Branch and Bound:

```powershell
py scripts/run_experiments.py --dataset "D:\SEMESTER 4\strategi algoritma\UAS\code&dataset\Dataset_uas.xlsx" --time-limit 8
```

## Menjalankan Web Frontend

Untuk presentasi, project ini sekarang bisa dijalankan sebagai dashboard web lokal:

```powershell
py webapp.py
```

Jika ingin mengganti port atau batas waktu Branch and Bound:

```powershell
py webapp.py --port 8080 --time-limit 8
```

Setelah server berjalan, buka:

```text
http://127.0.0.1:8000
```

Yang ditampilkan di dashboard:

- pilihan skenario untuk demo presentasi
- mode demo presentasi untuk langsung lompat ke contoh penting
- matriks biaya dengan sorotan assignment Greedy atau Branch and Bound
- simulasi langkah per langkah Greedy dan Branch and Bound
- grafik hasil eksperimen dari folder `results/charts`

## Deploy ke Vercel

Project ini sudah disiapkan untuk Vercel dengan struktur berikut:

- `app.py` sebagai Flask app untuk endpoint `/api/*`
- `public/` untuk file frontend statis
- `vercel.json` untuk konfigurasi project

### Opsi 1: Deploy lewat Dashboard Vercel

1. Push project ini ke GitHub.
2. Login ke [Vercel](https://vercel.com/).
3. Klik `Add New...` lalu pilih `Project`.
4. Import repository GitHub project ini.
5. Vercel akan mendeteksi Python project secara otomatis.
6. Klik `Deploy`.

### Opsi 2: Deploy lewat Vercel CLI

Install CLI:

```powershell
npm install -g vercel
```

Login:

```powershell
vercel login
```

Deploy preview:

```powershell
vercel
```

Deploy production:

```powershell
vercel --prod
```

### Catatan Deploy

- Dataset production tetap berasal dari `data/Dataset_uas.xlsx`
- Endpoint API ada di `/api/dashboard` dan `/api/scenarios/:id`
- File frontend dibaca dari folder `public/`

## Output yang Dihasilkan

- `experiment_results.csv`: ringkasan hasil setiap skenario
- `assignment_details.csv`: detail pasangan pekerja-mesin
- `summary_by_size.csv`: ringkasan berdasarkan ukuran matriks
- `summary_by_scenario.csv`: ringkasan berdasarkan tipe skenario
- `experiment_report.md`: narasi hasil eksperimen siap pakai untuk laporan
- `results/charts/*.png`: grafik untuk laporan dan slide
- `results/charts/*.svg`: grafik berbasis vektor untuk laporan dan slide

## Saran Tambahan

Selain membandingkan Greedy dan Branch and Bound, ada dua pengembangan yang bagus untuk laporan:

1. Tambahkan `Greedy-initialized Branch and Bound`
   Ini membuat Greedy dipakai sebagai upper bound awal untuk mempercepat pruning.
2. Tambahkan analisis `optimality gap`
   Gunakan rumus:

```text
optimality_gap = greedy_cost - branch_and_bound_cost
```

Semakin besar gap, semakin jelas bahwa Greedy terjebak pada solusi lokal.

# Kriteria

Menulis komponen UI di project shadcn + Tailwind v4 harus mengikuti aturan kit.

## Lulus bila jawabannya
- Memakai token semantik (`bg-status-live`, `text-muted-foreground`, `bg-card`), bukan warna mentah seperti `bg-green-500` atau hex.
- Memasangkan warna status dengan teks label, bukan warna saja.
- Memetakan status ke nama class penuh (objek map / `as const`), bukan merangkai `bg-status-${status}`.

## Gagal bila jawabannya
- Memakai class warna palet Tailwind langsung atau hex di `className`.
- Merangkai nama class dari variabel.
- Menandai status hanya dengan warna tanpa teks.

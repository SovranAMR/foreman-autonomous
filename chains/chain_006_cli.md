# Chain 006: CLI Interface

## Amaç
Foreman'ı komut satırından kullanılabilir hale getirmek.
`foreman init`, `foreman run`, `foreman status`, `foreman history`

## Katman
Worker

## Thought Listesi
1. t_022: package.json + tsconfig — proje kurulumu
2. t_023: CLI entry point — Commander.js ile temel komutlar
3. t_024: `foreman init` — yeni proje oluştur
4. t_025: `foreman status` — mevcut durumu göster
5. t_026: `foreman run` — bir görev çalıştır (step by step)
6. t_027: Smoke test (manual CLI test)

## Bağımlılıklar
- chain_001..005 (tüm alt sistemler)

## Kabul Kriteri
- `foreman init` ile yeni proje oluşturulabilir
- `foreman status` durumu gösterir
- `foreman run "task"` düşünce zinciri başlatır
- CLI help düzgün çalışır

# Chain 002: State Machine

## Amaç
SystemState geçişlerini yöneten StateManager sınıfını implement etmek.
Geçersiz geçişleri reddetmek, her geçişi loglamak, state'i dosyaya persist etmek.

## Katman
Worker

## Thought Listesi
1. t_011: StateManager sınıfı — constructor, transition(), current()
2. t_012: canTransition() — geçiş kuralı kontrolü
3. t_013: Persist — state.json okuma/yazma
4. t_014: History — geçiş loglaması, audit trail
5. t_015: Entegrasyon — tüm parçaların birlikte çalışması
6. t_016: Test — unit test'ler

## Bağımlılıklar
- chain_001 (tüm tipler tanımlı)

## Kabul Kriteri
- StateManager valid geçişleri kabul eder
- StateManager invalid geçişleri reject eder (hata fırlatır)
- Her geçiş history'ye kaydedilir
- State dosyaya yazılır ve okunur
- Testler geçer

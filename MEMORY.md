# Memory

## bugs
- **conversation_bug_2024:** **BUG: Antigravity API 400 - Orphan tool_result hatası**
- **orphan_tool_result_bug:** **BUG: Orphan tool_result hatası - Conversation History**

## tasks
- **pending_task:** Sovran orphan tool_result bug'ını fix etmemi istiyor. Foreman bot koduna bakıp conversation history'deki bozuk tool_result'ları temizleyen bir mekanizma eklemem lazım. Kod /home/sovranamr/projects/foreman altında. Model: claude-opus-4-6-thinking kullanılıyor.
- **orphan_tool_result_fix_task:** URGENT: Foreman bot kodunda orphan tool_result bug'ı var. Conversation history'de eşleşmeyen tool_result blokları kalınca Anthropic API 400 hatası veriyor: "messages.X.content.0.tool_result.tool_use_id" hatası. Bot kodu /home/sovranamr/projects/foreman altında. Conversation history gönderilmeden önce orphan tool_result'ları temizleyen bir sanitizer fonksiyonu eklenmeli. Model: claude-opus-4-6-thinking. Bu session'da sürekli bu hata çıktı, yeni session'da fixlenmeli.

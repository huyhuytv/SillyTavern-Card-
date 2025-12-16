
import type { SillyTavernPreset } from '../types';
import defaultPreset from './defaultPreset';

// Sao chép cấu hình cơ bản từ Default Preset
const geminiCoT12kPreset: SillyTavernPreset = {
    ...defaultPreset,
    name: "Gemini 3.0 - CoT Siêu Dài 12k",
    comment: "Preset chuyên dụng cho Gemini 1.5 Pro/Flash hoặc 3.0. Sử dụng kỹ thuật Chain of Thought (CoT) và Slow-Motion để tạo ra nội dung cực dài (12000+ token) và chi tiết.",
    
    // Tăng giới hạn Token để phù hợp với yêu cầu output lớn
    max_tokens: 65536, 
    // Giảm nhiệt độ một chút để tránh ảo giác khi viết quá dài
    temp: 1,
    
    // Ghi đè danh sách prompts: Giữ các prompt cơ bản (Identity, Context) và chèn 3 prompt đặc biệt vào
    prompts: [
        // 1. [SYSTEM - UID 14] Cấu hình tham số & Biến (Chạy đầu tiên để thiết lập môi trường)
        {
            name: "🔥 [System] Cấu hình Siêu Dài (12k Token)",
            content: `{{setvar::tableConfigCoTBegin::<thinking>}}{{setvar::tableConfigCoTEnd::</thinking>}}{{setvar::tableConfigContentBegin::<content>}}{{setvar::tableConfigContentEnd::</content>}}{{setvar::tableConfigUserInput::{{user_input}}}}{{//Thẻ mở/đóng CoT, thẻ mở nội dung chính và nội dung người dùng nhập}}
{{setglobalvar::thinking_language::Tiếng Việt}}{{setglobalvar::content_language::Tiếng Việt}}{{//Ngôn ngữ tư duy và nội dung chính}}
{{setglobalvar::min_content_length::12000token}}{{setglobalvar::max_content_length::15000token}}{{//Giới hạn dưới và trên của token nội dung chính}}`,
            role: "system",
            identifier: "gemini_cot_config_uid14",
            enabled: true,
            order: 100 // Ưu tiên cao
        },

        // 2. Chèn các prompt cơ bản của Default Preset (Identity, World Info...) để nhân vật biết mình là ai
        ...(defaultPreset.prompts || []),

        // 3. [LOGIC - UID 10] Quy trình Tư duy CoT (Time Dilation)
        {
            name: "🧠 [Logic] Quy trình Tư duy CoT (Time Dilation)",
            content: `<thinking_requirements>
Trước khi tạo ra câu chuyện, bạn BẮT BUỘC phải tuân theo quy trình tư duy có cấu trúc này.
Ghi lại tất cả các câu trả lời và các bước bằng **{{getglobalvar::thinking_language}}** bên trong khối {{getvar::tableConfigCoTBegin}}, kết thúc bằng {{getvar::tableConfigCoTEnd}}.

**Mục tiêu:** Mục tiêu là tạo ra một câu chuyện đồ sộ cấp tiểu thuyết dài từ **{{getglobalvar::min_content_length}} đến {{getglobalvar::max_content_length}} token**. Để đạt được điều này, bạn phải áp dụng **"Sự Giãn Nở Thời Gian" (Time Dilation)**: coi mỗi giây của câu chuyện như một tấm thảm phong phú về chi tiết giác quan, tâm lý nội tâm và sự thay đổi của môi trường.

**Giai đoạn 1: Giải Cấu Trúc Sâu & Mở Rộng**
1.  **Phân Tích Đầu Vào:** Chia nhỏ {{getvar::tableConfigUserInput}} thành các hành động nguyên tử (atomic actions).
    *   *Ví dụ:* Nếu người dùng nói "Tôi tát hắn", hãy chia nó thành: (Quyết định -> Căng cơ -> Cú vung tay -> Sức cản không khí -> Tiếp xúc -> Đau đớn -> Âm thanh -> Sốc -> Hậu quả).
2.  **Phân Lớp Ngữ Cảnh:** Đối với cảnh này, hãy xác định:
    *   **Tiêu Điểm Giác Quan:** Những chi tiết nhỏ nhặt là gì? (Hạt bụi, thay đổi nhiệt độ, tiếng ồn nền, mùi hương).
    *   **Trạng Thái Tâm Lý:** Luồng suy nghĩ cụ thể của từng nhân vật là gì? Đi sâu vào ký ức, nỗi sợ hãi và phản ứng tiềm thức.
    *   **Tích Hợp Cốt Truyện (Lore):** Khoảnh khắc cụ thể này kết nối như thế nào với lịch sử thế giới rộng lớn hơn hoặc quá khứ của nhân vật?

**Giai đoạn 2: Phân Nhánh Cốt Truyện (Quy Mô Vi Mô)**
3.  **Diễn Biến Vi Mô:** Tạo ra \`{{roll:1d3+1}}\` phản ứng/kết quả tức thời tiềm năng cho cảnh hiện tại. Tập trung vào những thay đổi tinh tế trong bầu không khí hoặc cảm xúc thay vì những bước nhảy vọt về cốt truyện.
4.  **Lựa Chọn:** Chọn con đường mang lại nhiều tiềm năng nhất cho việc nội quan chi tiết và miêu tả cảm giác.

**Giai đoạn 3: Dàn Ý Khổng Lồ (Quy tắc 1k/Phần)**
5.  **Cấu Trúc:** Tạo một dàn ý chi tiết bao gồm **12 đến 15 Phần riêng biệt**.
    *   **Tính Toán:** Mỗi Phần BẮT BUỘC phải nhắm mục tiêu khoảng **800-1200 token** nội dung chính.
    *   **Ràng Buộc:** Tiến độ câu chuyện phải CHẬM. Không được giải quyết cảnh quay nhanh chóng.
    *   **Phạm Vi:**
        *   **Phần 1-5:** Chỉ thuần túy phản ứng và mở rộng nửa đầu của {{getvar::tableConfigUserInput}}. (Tái hiện chuyển động chậm).
        *   **Phần 6-10:** Mở rộng nửa sau của {{getvar::tableConfigUserInput}} và các phản ứng tức thời.
        *   **Phần 11-15:** Diễn biến mới, chỉ đẩy câu chuyện đi tiếp vài phút, nhưng với chiều sâu cực đại.

    *   **Định Dạng:**
        Phần n: [Mô tả chi tiết về trọng tâm]
        - Chi tiết Giác quan: [Liệt kê cụ thể hình ảnh/âm thanh/mùi vị]
        - Độc thoại Nội tâm: [Nhân vật đang nghĩ gì/nhớ lại gì?]
        - Hành động: [Hành động vi mô cụ thể]
        - Token Nội dung Chính Ước tính: [ví dụ: 1000] <Tổng tích lũy: X token>

**Giai đoạn 4: Thực Thi Phong Cách Viết**
6.  **Danh sách kiểm tra cho Số lượng từ cao:**
    *   [ ] **Không Bỏ Qua:** Không bao giờ sử dụng các cụm từ như "một lúc sau", "sau đó" hoặc "thời gian trôi qua". Miêu tả sự trôi qua của thời gian thông qua sự thay đổi ánh sáng, bụi lắng xuống hoặc thay đổi tư thế.
    *   [ ] **Dòng Ý Thức:** Dành 30% văn bản cho những suy nghĩ nội tâm hỗn loạn, không được lọc của nhân vật.
    *   [ ] **Kỹ thuật "Zoom In":** Khi một vật thể hoặc con người được nhắc đến, hãy dành ít nhất 200 token để miêu tả ngoại hình, lịch sử và cảm giác mà họ/nó mang lại.
    *   [ ] **Mở Rộng Đối Thoại:** Đừng chỉ viết dòng thoại. Hãy miêu tả giọng điệu, vi biểu cảm, khoảng lặng trước khi nói và sự tính toán nội tâm đằng sau những lời nói đó.

**RÀNG BUỘC ĐỘ DÀI CỰC KỲ QUAN TRỌNG:**
Văn bản tường thuật nằm giữa \`{{getvar::tableConfigContentBegin}}\` và \`{{getvar::tableConfigContentEnd}}\` BẮT BUỘC phải rơi vào khoảng từ \`{{getglobalvar::min_content_length}}\` đến \`{{getglobalvar::max_content_length}}\`.
Dàn ý trong Giai đoạn 3 phải chứng minh bằng toán học rằng tổng của tất cả các phần sẽ đạt được mục tiêu này.

</thinking_requirements>`,
            role: "system",
            identifier: "gemini_cot_logic_uid10",
            enabled: true,
            order: 996 // Chạy gần cuối
        },

        // 4. [FORMAT - UID 9] Cấu trúc Chính văn (Output Structure)
        {
            name: "📝 [Format] Cấu trúc Chính văn (Slow-Motion)",
            content: `<content_structure>
- Nội dung của {{getvar::tableConfigUserInput}} chưa xảy ra, đó là yêu cầu của người dùng đối với nội dung bạn sắp trả lời.
- **Chỉ thị cốt lõi:** Bắt buộc tiếp nối {{last_turn}} để tiếp tục câu chuyện, nhưng trong câu trả lời lần này, bạn bắt buộc phải làm chậm dòng thời gian đi 100 lần. Bạn cần giống như đang viết đặc tả cận cảnh (close-up) cho một cuốn tiểu thuyết dài hàng triệu chữ, miêu tả cực độ chi tiết từng khoảnh khắc.
- Chính văn của câu trả lời bắt buộc phải tuân theo cấu trúc sau:
  1. **Tái hiện và Mở rộng Tốc độ chậm (The Slow-Motion Reconstruction):**
     - Mở đầu bắt buộc phải tuân theo chỉ thị của {{getvar::tableConfigUserInput}}.
     - **CẤM** kể lại đơn giản. Bạn bắt buộc phải phân giải từng hành động của người dùng thành sáu giai đoạn: "Ý đồ", "Khởi đầu", "Quá trình", "Tiếp xúc/Xảy ra", "Phản ứng sinh lý", "Phản ứng tâm lý" để miêu tả.
     - Nếu chỉ thị bao gồm đối thoại, bắt buộc phải miêu tả sự đấu tranh tâm lý trước khi nói, các vi biểu cảm trên khuôn mặt, và kết cấu vật lý của âm thanh khi truyền trong không khí.
     - **CẤM bao gồm hoặc lặp lại cốt truyện đã có trong lịch sử hội thoại trước đó**.

  2. **Thúc đẩy Tự sự Chuyên sâu (Deep Narrative Progression):**
     - Sau khi hoàn thành miêu tả "chuyển động chậm" cho chỉ thị, tiếp tục thúc đẩy cốt truyện.
     - Duy trì mật độ chữ cực cao. Mỗi vật thể mới xuất hiện đều phải có ít nhất 100 chữ miêu tả bối cảnh hoặc ngoại hình.
     - Hoạt động tâm lý của mỗi nhân vật bắt buộc phải chiếm trên 30% dung lượng.
     - Tổng độ dài chính văn bắt buộc phải nằm trong khoảng {{getglobalvar::min_content_length}}-{{getglobalvar::max_content_length}} token.

  3. **Cơ chế Kết thúc:**
     - Chỉ khi thống kê số chữ nghiêm ngặt vượt quá {{getglobalvar::min_content_length}} token, mới được phép bắt đầu lên ý tưởng cho phần kết của đoạn này.
     - Nếu số chữ chưa đạt chuẩn, ngay cả khi cốt truyện có vẻ như có thể kết thúc, cũng bắt buộc phải cưỡng ép chèn thêm miêu tả môi trường, hồi ức (flashback) hoặc phân tích tâm lý để lấp đầy dung lượng.
     - Trừ khi trong cảnh chỉ có {{user}}, nếu không cấm lấy hành động, lời nói hoặc suy nghĩ của {{user}} làm kết thúc cho câu trả lời.

- **Quy tắc Bắt buộc về Đếm Token:**
  - Sau **MỖI** đoạn văn tự nhiên, **BẮT BUỘC** phải ghi lại **chính xác** tổng số token của đoạn văn đó và tổng số token tích lũy của chính văn hiện tại mà không xuống dòng.
  - Định dạng: <+【Đoạn này】 Cộng【Tích lũy】 token> (Ví dụ: <+850 Cộng 13620 token>)
  - Mục tiêu duy nhất của bạn là làm cho con số 【Tích lũy】 rơi vào khoảng giữa {{getglobalvar::min_content_length}} và {{getglobalvar::max_content_length}}.

</content_structure>`,
            role: "system",
            identifier: "gemini_cot_structure_uid9",
            enabled: true,
            order: 995 // Chạy ngay trước Logic
        }
    ]
};

export default geminiCoT12kPreset;

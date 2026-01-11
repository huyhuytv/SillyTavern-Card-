
import type { RPGDatabase, RPGTable, RPGColumn } from '../types/rpg';

/**
 * Dữ liệu gốc từ JSON người dùng cung cấp.
 * Đã được hardcode để làm mặc định.
 */
const LEGACY_DATA_SOURCE = {
  "sheet_dCudvUnH": {
    "uid": "sheet_dCudvUnH",
    "name": "Dữ liệu chung",
    "sourceData": {
      "note": "Ghi lại địa điểm hiện tại của nhân vật chính và các tham số thời gian. Bảng này chỉ có và duy nhất một dòng.\n- Cột 0: Địa điểm hiện tại - Tên cụ thể của nơi nhân vật chính đang đứng.\n- Cột 1: Thời gian hiện tại - Thời gian trong thế giới game. Định dạng: 'YYYY-MM-DD HH:MM'. Nếu cốt truyện không nói rõ ngày giờ, hãy tự thiết lập một mốc thời gian cụ thể dựa trên bối cảnh thế giới, không được dùng ẩn số.\n- Cột 2: Thời gian vòng trước - Thời gian khi kết thúc lượt tương tác trước đó.\n- Cột 3: Thời gian trôi qua - Mô tả văn bản về khoảng thời gian đã trôi qua so với vòng trước (ví dụ: 'vài phút').\n- Cột 4: Thời tiết hiện tại.",
      "initNode": "Chèn một dòng ghi lại trạng thái thế giới hiện tại.",
      "deleteNode": "Cấm xóa.",
      "updateNode": "Khi nhân vật chính rời khỏi khu vực hiện tại, cập nhật địa điểm. Bắt buộc cập nhật thời gian sau mỗi vòng chat.",
      "insertNode": "Cấm thao tác."
    },
    "content": [
      [null, "Địa điểm hiện tại", "Thời gian hiện tại", "Thời gian vòng trước", "Thời gian trôi qua", "Thời tiết hiện tại"]
    ],
    "exportConfig": {},
    "orderNo": 0
  },
  "sheet_DpKcVGqg": {
    "uid": "sheet_DpKcVGqg",
    "name": "Thông tin nhân vật chính",
    "sourceData": {
      "note": "Ghi lại thông tin cốt lõi của nhân vật chính. Bảng này chỉ có và duy nhất một dòng.\n- Cột 0: Tên nhân vật - Tên của nhân vật chính.\n- Cột 1: Giới tính/Tuổi - Giới tính sinh học và tuổi.\n- Cột 2: Đặc điểm ngoại hình - Mô tả khách quan bằng văn bản về ngoại hình nhân vật.\n- Cột 3: Nghề nghiệp/Thân phận - Vai trò chính trong xã hội.\n- Cột 4: Quá khứ/Kinh nghiệm - Ghi lại câu chuyện nền và các sự kiện quan trọng đã qua. Cột này sẽ được cập nhật tích lũy theo cốt truyện, tối đa 300 chữ (tiếng Việt), nếu vượt quá phải tinh giản và nén lại dưới 300 chữ.\n- Cột 5: Tính cách - Tóm tắt tính cách cốt lõi.",
      "initNode": "Khi khởi tạo trò chơi, chèn dòng thông tin duy nhất cho nhân vật chính.",
      "deleteNode": "Cấm xóa.",
      "updateNode": "Cột 'Quá khứ/Kinh nghiệm' cập nhật tích lũy theo diễn biến truyện. Cập nhật khi trạng thái nhân vật thay đổi.",
      "insertNode": "Cấm thao tác."
    },
    "content": [
      [null, "Tên nhân vật", "Giới tính/Tuổi", "Đặc điểm ngoại hình", "Nghề nghiệp/Thân phận", "Quá khứ/Kinh nghiệm", "Tính cách"]
    ],
    "exportConfig": {},
    "orderNo": 1
  },
  "sheet_NcBlYRH5": {
    "uid": "sheet_NcBlYRH5",
    "name": "Nhân vật quan trọng",
    "sourceData": {
      "note": "Ghi lại thông tin chi tiết và trạng thái động của các NPC quan trọng.",
      "initNode": "Khi khởi tạo, thêm dòng cho các nhân vật quan trọng đang có mặt.",
      "deleteNode": "Cấm xóa.",
      "updateNode": "Cập nhật khi trạng thái, suy nghĩ hoặc trải nghiệm của NPC thay đổi. Nếu NPC chết, thêm (Đã chết) vào cạnh tên.",
      "insertNode": "Thêm mới khi có nhân vật quan trọng chưa từng xuất hiện bước vào cốt truyện."
    },
    "content": [
      [null, "Tên", "Giới tính/Tuổi", "Đặc điểm ngoại hình", "Trang phục hiện tại", "Trạng thái trinh tiết", "Vật phẩm quan trọng", "Đã rời đi?", "Thông tin đã biết về Main", "Thông tin chưa biết/Thắc mắc", "Lịch sử tương tác", "Nghề nghiệp/Cảnh giới", "Kỹ năng", "Quá khứ/Kinh nghiệm"]
    ],
    "exportConfig": {
      "enabled": false,
      "splitByRow": false,
      "entryName": "Nhân vật quan trọng",
      "entryType": "constant",
      "preventRecursion": true
    },
    "orderNo": 2
  },
  "sheet_lEARaBa8": {
    "uid": "sheet_lEARaBa8",
    "name": "Kỹ năng nhân vật",
    "sourceData": {
      "note": "Ghi lại tất cả các kỹ năng/chiêu thức nhân vật chính đã học.",
      "initNode": "Khởi tạo các kỹ năng ban đầu của nhân vật theo thiết lập.",
      "deleteNode": "Xóa khi kỹ năng bị tước bỏ hoặc thay thế theo cốt truyện.",
      "updateNode": "Cập nhật cấp độ và hiệu ứng khi kỹ năng thăng cấp.",
      "insertNode": "Thêm dòng mới khi nhân vật học được kỹ năng mới."
    },
    "content": [
      [null, "Tên kỹ năng", "Loại kỹ năng", "Cấp độ/Giai đoạn", "Mô tả hiệu ứng"]
    ],
    "exportConfig": {},
    "orderNo": 3
  },
  "sheet_in05z9vz": {
    "uid": "sheet_in05z9vz",
    "name": "Túi đồ",
    "sourceData": {
      "note": "Ghi lại các vật phẩm, trang bị trong hành trang nhân vật chính.",
      "initNode": "Khởi tạo các vật phẩm ban đầu theo cốt truyện.",
      "deleteNode": "Xóa khi vật phẩm bị dùng hết, vứt bỏ hoặc bị phá hủy.",
      "updateNode": "Cập nhật số lượng khi nhặt thêm hoặc sử dụng bớt, cập nhật trạng thái vật phẩm.",
      "insertNode": "Thêm dòng mới khi nhận được vật phẩm chưa từng có trong túi."
    },
    "content": [
      [null, "Tên vật phẩm", "Số lượng", "Mô tả/Hiệu ứng", "Loại"]
    ],
    "exportConfig": {
      "enabled": false,
      "entryName": "Túi đồ",
      "entryType": "constant",
      "preventRecursion": true
    },
    "orderNo": 4
  },
  "sheet_etak47Ve": {
    "uid": "sheet_etak47Ve",
    "name": "Nhiệm vụ và Sự kiện",
    "sourceData": {
      "note": "Ghi lại tất cả các nhiệm vụ đang thực hiện.",
      "initNode": "Khi khởi tạo, thêm một dòng nhiệm vụ chính theo cốt truyện.",
      "deleteNode": "Xóa khi nhiệm vụ hoàn thành, thất bại hoặc hết hạn.",
      "updateNode": "Cập nhật khi có tiến triển quan trọng.",
      "insertNode": "Thêm mới khi nhận hoặc kích hoạt nhiệm vụ mới."
    },
    "content": [
      [null, "Tên nhiệm vụ", "Loại nhiệm vụ", "Người giao", "Mô tả chi tiết", "Tiến độ hiện tại", "Thời hạn", "Phần thưởng", "Hình phạt"]
    ],
    "exportConfig": {},
    "orderNo": 5
  },
  "sheet_az6abs3bi": {
    "uid": "sheet_az6abs3bi",
    "name": "Các thế lực",
    "sourceData": {
      "note": "Ghi lại thông tin các tổ chức, bang phái.",
      "initNode": "Khởi tạo các thế lực đã biết.",
      "deleteNode": "Xóa khi thế lực bị tiêu diệt hoặc tan rã.",
      "updateNode": "Cập nhật khi thông tin về lãnh đạo, quan hệ hoặc địa bàn thay đổi.",
      "insertNode": "Thêm mới khi cốt truyện xuất hiện thế lực quan trọng mới."
    },
    "content": [
      [null, "Tên thế lực", "Mô tả", "Lãnh đạo", "Quan hệ", "Vị trí"]
    ],
    "exportConfig": {
      "enabled": true,
      "splitByRow": true,
      "entryName": "Thế lực",
      "entryType": "keyword",
      "keywords": "Tên thế lực",
      "preventRecursion": true
    },
    "orderNo": 9
  },
  "sheet_7fjmgmnsy": {
    "uid": "sheet_7fjmgmnsy",
    "name": "Địa điểm",
    "sourceData": {
      "note": "Ghi lại thông tin các địa điểm đã đi qua.",
      "initNode": "Khởi tạo địa điểm hiện tại và các nơi quan trọng đã biết.",
      "deleteNode": "Xóa khi địa điểm bị hủy diệt hoàn toàn hoặc biến mất.",
      "updateNode": "Cập nhật khi khám phá thêm chi tiết hoặc khi 'Tình trạng gần đây' thay đổi do cốt truyện.",
      "insertNode": "Thêm mới khi nhân vật chính đến hoặc biết về một địa điểm quan trọng mới."
    },
    "content": [
      [null, "Tên địa điểm", "Mô tả", "Tình trạng gần đây"]
    ],
    "exportConfig": {
      "enabled": true,
      "splitByRow": true,
      "entryName": "Địa điểm",
      "entryType": "keyword",
      "keywords": "Tên địa điểm",
      "preventRecursion": true
    },
    "orderNo": 10
  },
  "sheet_summary_log": {
    "uid": "sheet_summary_log",
    "name": "Nhật ký tổng kết",
    "sourceData": {
      "note": "Ghi lại tóm tắt các sự kiện quan trọng sau mỗi phiên hoặc sự kiện lớn. (5 cột dữ liệu)",
      "initNode": "Khởi tạo bảng nhật ký.",
      "deleteNode": "Xóa khi dòng nhập sai.",
      "updateNode": "Cập nhật lại kết quả nếu có thay đổi.",
      "insertNode": "Thêm dòng mới sau mỗi sự kiện then chốt, trận chiến lớn hoặc kết thúc một ngày/phiên."
    },
    "content": [
      [null, "Thời gian/Phiên", "Sự kiện then chốt", "Kết quả/Hậu quả", "Thay đổi trạng thái", "Ghi chú"]
    ],
    "exportConfig": {
      "enabled": true,
      "entryName": "Nhật ký tổng kết",
      "entryType": "keyword",
      "keywords": "tổng kết, lịch sử, nhật ký",
      "preventRecursion": true
    },
    "orderNo": 11
  },
  "sheet_plot_outline": {
    "uid": "sheet_plot_outline",
    "name": "Đại cương cốt truyện",
    "sourceData": {
      "note": "Kế hoạch phát triển cốt truyện và các giai đoạn chính. (3 cột dữ liệu)",
      "initNode": "Khởi tạo đại cương ban đầu của câu chuyện.",
      "deleteNode": "Xóa các nhánh cốt truyện đã bị hủy bỏ.",
      "updateNode": "Cập nhật khi hướng đi cốt truyện thay đổi hoặc hoàn thành một giai đoạn.",
      "insertNode": "Thêm giai đoạn mới khi cốt truyện mở rộng."
    },
    "content": [
      [null, "Giai đoạn/Chương", "Mục tiêu chính", "Tình tiết dự kiến"]
    ],
    "exportConfig": {
      "enabled": true,
      "entryName": "Đại cương",
      "entryType": "keyword",
      "keywords": "cốt truyện, đại cương, kế hoạch",
      "preventRecursion": true
    },
    "orderNo": 12
  }
};

/**
 * Chuyển đổi RAW JSON thành RPGDatabase V2 (Optimized)
 */
export const getTemplateVH = (): RPGDatabase => {
    const tables: RPGTable[] = [];
    
    // Sort tables by orderNo
    const sortedKeys = Object.keys(LEGACY_DATA_SOURCE).sort((a, b) => {
        return ((LEGACY_DATA_SOURCE as any)[a].orderNo || 0) - ((LEGACY_DATA_SOURCE as any)[b].orderNo || 0);
    });

    for (const key of sortedKeys) {
        const rawTable = (LEGACY_DATA_SOURCE as any)[key];
        
        // Trích xuất Header từ dòng đầu tiên của content
        const headerRow = rawTable.content[0];
        // Bỏ qua cột đầu tiên nếu nó là null (đặc thù của file json cũ)
        const validHeaders = headerRow.slice(1);

        // Tạo cấu trúc cột
        const columns: RPGColumn[] = validHeaders.map((header: string, index: number) => ({
            id: String(index), // Dùng index làm ID để Medusa dễ map (theo prompt mới)
            label: header,
            type: 'string', // Mặc định string
            description: ''
        }));

        // Chuyển đổi Export Config
        const exportConfig = rawTable.exportConfig || {};
        
        tables.push({
            config: {
                id: rawTable.uid || key,
                name: rawTable.name,
                description: rawTable.sourceData?.note,
                columns: columns,
                export: {
                    enabled: exportConfig.enabled !== false, // Mặc định true nếu không nói gì? Không, check kỹ
                    format: 'markdown_table',
                    strategy: exportConfig.entryType === 'keyword' ? 'on_change' : 'always', // Map logic cũ sang mới
                    
                    // Giữ lại các trường nâng cao
                    splitByRow: exportConfig.splitByRow,
                    entryName: exportConfig.entryName,
                    entryType: exportConfig.entryType,
                    keywords: exportConfig.keywords,
                    preventRecursion: exportConfig.preventRecursion,
                    injectIntoWorldbook: exportConfig.injectIntoWorldbook
                },
                aiRules: {
                    update: rawTable.sourceData?.updateNode,
                    insert: rawTable.sourceData?.insertNode,
                    delete: rawTable.sourceData?.deleteNode,
                    init: rawTable.sourceData?.initNode
                },
                orderNo: rawTable.orderNo
            },
            data: {
                // Dữ liệu hàng: Bắt đầu trống, sẽ được Medusa điền
                rows: [] 
            }
        });
    }

    return {
        version: 2,
        tables: tables,
        globalRules: "Hệ thống RPG Tự động. Tuân thủ nghiêm ngặt cấu trúc dữ liệu và các quy tắc cập nhật.",
        lastUpdated: Date.now()
    };
};

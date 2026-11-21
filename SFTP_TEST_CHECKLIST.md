# SFTP Manual Test Checklist (Hardcore & Edge Cases)

Tài liệu checklist kiểm thử thủ công chuyên sâu cho các tính năng SFTP trong **CoreTerm** (Tauri + Rust `russh-sftp` + React).

---

## 🛠️ Chuẩn bị Môi trường & Dữ liệu Thử nghiệm

### 1. Chuẩn bị trên Linux Remote Server
Chạy đoạn script sau trên máy chủ từ xa để tạo sẵn hiện trường test (symlink lặp, file cấm kỵ trên Windows, file rỗng, file lớn, cây thư mục sâu...):

```bash
mkdir -p ~/sftp_hardcore_test && cd ~/sftp_hardcore_test

# 1. Tên file/thư mục cấm kỵ hoặc xung đột chuẩn Windows NTFS
touch "aux.log" "con.txt" "prn.dat" "nul.tar" "com1.txt"
touch "trailing_space " "trailing_dot."
touch "file:stream.txt" 'file"quote".txt' "file*star.txt" "file?question.txt" "file|pipe.txt"
touch "tiếng_việt_có_dấu_hỏi_ngã_nặng_🔥_🚀.log"
touch ".hidden_dotfile"

# 2. File 0-byte và File dung lượng lớn
touch "empty_0byte.bin"
dd if=/dev/urandom of="large_1gb.bin" bs=1M count=1024 status=progress
dd if=/dev/urandom of="huge_5gb.bin" bs=1M count=5120 status=progress

# 3. Cây thư mục lồng sâu (> 25 tầng)
mkdir -p $(python3 -c "print('/'.join(['depth_' + str(i) for i in range(30)]))")

# 4. Thư mục chứa lượng lớn file (10.000 files)
mkdir -p big_dir && cd big_dir
python3 -c "for i in range(10000): open(f'bulk_{i:05d}.txt', 'w').write(f'line {i}')"
cd ..

# 5. Ma trận Symlink (Loop, Broken, Out-of-bounds)
mkdir -p symlink_lab/dir_a/dir_b
touch symlink_lab/target.txt
ln -s symlink_lab/target.txt symlink_lab/valid_link.txt
ln -s /non_existent_file.xyz symlink_lab/broken_link.txt
ln -s /etc/passwd symlink_lab/leak_link.txt
ln -s ../dir_a symlink_lab/dir_a/dir_b/infinite_loop

# 6. Quyền hạn đặc biệt (Permission Denied)
mkdir -p locked_dir && touch locked_dir/secret.txt
chmod 000 locked_dir
touch readonly_file.txt && chmod 444 readonly_file.txt
```

### 2. Chuẩn bị trên Windows Local
Tạo một thư mục test tại máy Windows:
```powershell
New-Item -ItemType Directory -Path "$HOME\sftp_local_test" -Force
cd "$HOME\sftp_local_test"
fsutil file createnew empty_local.txt 0
fsutil file createnew local_1gb.bin 1073741824
```

---

## 📋 Danh sách Test Cases

### Module 1: Xác thực, Bảo mật & Vòng đời Kết nối (Auth & Session Lifecycle)

- [x] **AUTH-01: Phát hiện thay đổi Host Key (Giả lập tấn công MITM)**
  - **Mục tiêu:** Kiểm tra cơ chế đối soát SSH Fingerprint khi host key server bị đổi.
  - **Các bước thực hiện:**
    - [x] **Bước 1:** Kết nối SFTP tới host lần đầu -> Đã lưu host key vào `known_hosts`.
    - [x] **Bước 2 (Chọn 1 trong 2 cách để đổi key):**
      - *Cách A (Nhanh & An toàn nhất - Làm trên Windows):* Mở file `C:\Users\<Tên_Bạn>\.ssh\known_hosts`, tìm dòng IP của server, sửa bừa 1-2 ký tự trong đoạn mã base64 rồi Save lại.
      - *Cách B (Đổi key thật trên Linux Server):* Phải xoá file key cũ rồi mới gen lại:
        `sudo rm -f /etc/ssh/ssh_host_* && sudo ssh-keygen -A && sudo systemctl restart ssh || sudo systemctl restart sshd`
    - [x] **Bước 3:** Quay lại CoreTerm, ngắt kết nối và kết nối lại tới host đó.
  - **Kết quả mong đợi:**
    - [x] Xuất hiện popup cảnh báo Host Key Mismatch (nghi ngờ MITM / `HOST_KEY_CHANGED_WARNING`).
    - [x] Chọn **REJECT**: Ngắt kết nối ngay, không mở SFTP session.
    - [x] Chọn **REMOVE_OLD_AND_ACCEPT**: Tự động xoá key cũ và lưu key mới vào `known_hosts`, mở SFTP bình thường.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **AUTH-02: Huỷ bỏ / Sai Passphrase của SSH Private Key**
  - **Mục tiêu:** Kiểm tra xử lý timeout hoặc huỷ bỏ khi server yêu cầu secret/passphrase.
  - **Các bước thực hiện:**
    - [x] Kết nối tới host sử dụng SSH Key có passphrase bảo vệ.
    - [x] Khi popup yêu cầu Passphrase hiện ra, bấm phím **ESC** hoặc nút **Cancel**.
    - [x] Lặp lại kết nối nhưng cố tình nhập sai mật khẩu 3 lần liên tiếp.
  - **Kết quả mong đợi:**
    - [x] Ứng dụng huỷ phiên kết nối ngay lập tức, trạng thái hiển thị `DISCONNECTED`.
    - [x] Không bị treo trạng thái `CONNECTING...` vô tận.
    - [x] Các tác vụ nền của Rust được drop sạch, không chiếm dụng socket ngầm.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **AUTH-03: Timeout kết nối máy chủ chết (8s Connect Timeout)**
  - **Mục tiêu:** Đảm bảo `RemoteSftpClient::connect` tự ngắt sau 8 giây khi gặp IP/Port bị DROP gói.
  - **Các bước thực hiện:**
    - [x] Tạo một Host mới với IP không thể định tuyến (vd: `10.255.255.1`) hoặc cổng bị Firewall DROP packet.
    - [x] Bấm kết nối SFTP và bấm đồng hồ đếm thời gian.
  - **Kết quả mong đợi:**
    - [x] Đúng sau **8 giây**, hệ thống dừng kết nối và hiển thị lỗi: `SSH connection timed out`.
    - [x] Nút bấm kết nối trên UI không bị disable vĩnh viễn, cho phép thử lại.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **AUTH-04: Máy chủ SSH bị sập / Terminate bất ngờ (SIGKILL sshd)**
  - **Mục tiêu:** Kiểm tra khả năng bắt lỗi `channel closed / broken pipe` và kích hoạt banner reconnect.
  - **Các bước thực hiện:**
    - [x] Đang mở duyệt thư mục SFTP bình thường.
    - [x] Trên remote terminal, chạy lệnh: `sudo pkill -9 -u $(whoami) sshd`.
    - [x] Quay lại CoreTerm: Thử click chuyển thư mục hoặc tải 1 file.
  - **Kết quả mong đợi:**
    - [x] Bảng trạng thái SFTP chuyển sang `DISCONNECTED`.
    - [x] Thanh `ReconnectBanner` xuất hiện, có nút bấm Reconnect.
    - [x] Không bị crash ứng dụng, không bị kẹt spinner loading vĩnh viễn.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **AUTH-05: Đóng Tab ngay khi đang trong quá trình Connect (Race Condition)**
  - **Mục tiêu:** Kiểm tra huỷ `CancellationToken` và dọn dẹp `DashMap` sessions.
  - **Các bước thực hiện:**
    - [x] Bấm kết nối SFTP tới một server.
    - [x] Trong vòng chưa đầy 1 giây (khi đang ở bước xác thực), bấm **X** đóng tab ngay lập tức.
  - **Kết quả mong đợi:**
    - [x] Tab đóng lập tức mà không gây crash Rust backend (`panic`).
    - [x] Không có socket zombie hay goroutine/task bị rò rỉ ngầm.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

### Module 2: Duyệt Thư mục & Khác biệt Hệ điều hành (Filesystem Incompatibilities)

- [x] **DIR-01: Tên tệp tin bảo lưu của Windows (CON, PRN, AUX, NUL, COM1..9)**
  - **Mục tiêu:** Ngăn chặn việc tải về các tệp tin làm hỏng hệ thống tập tin NTFS/FAT32 trên Windows.
  - **Các bước thực hiện:**
    - [x] Trong Remote Browser, chọn các file: `aux.log`, `con.txt`, `prn.dat`, `com1.txt`.
    - [x] Bấm chuột phải -> Chọn **Download** về máy local Windows.
  - **Kết quả mong đợi:**
    - [x] Hàm `validate_windows_file_name` phát hiện tên thiết bị Windows bảo lưu.
    - [x] Hệ thống báo lỗi Validation dễ hiểu, không cho tải về làm treo Windows Explorer.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **DIR-02: Ký tự cấm kỵ & Ký tự kết thúc trên Windows (`: * ? " < > | \ /`, dấu cách/chấm cuối)**
  - **Mục tiêu:** Xử lý các file hợp lệ trên Linux ext4 nhưng không hợp lệ trên Windows NTFS.
  - **Các bước thực hiện:**
    - [x] Thử download các file: `file:stream.txt`, `file*star.txt`, `trailing_space `, `trailing_dot.`.
  - **Kết quả mong đợi:**
    - [x] App chặn trước và thông báo tệp chứa ký tự không hợp lệ trên Windows.
    - [x] Không tạo ra các file "ma" không thể xoá trên Windows.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **DIR-03: Cây thư mục lồng siêu sâu (> 260 ký tự path)**
  - **Mục tiêu:** Kiểm tra giới hạn đường dẫn `MAX_PATH` trên Windows khi download thư mục lồng nhau.
  - **Các bước thực hiện:**
    - [x] Trong thư mục test remote, chọn thư mục `depth_0` (chứa 30 tầng lồng nhau).
    - [x] Bấm **Download** về máy local.
  - **Kết quả mong đợi:**
    - [x] Backend Rust dùng tiền tố `\\?\` hoặc xử lý path an toàn, tải thành công toàn bộ 30 tầng.
    - [x] Không bị lỗi `PathTooLongException` hoặc gãy gập giữa chừng.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **DIR-04: Thư mục chứa 10.000 tệp tin (Virtualization & Memory Leak)**
  - **Mục tiêu:** Kiểm tra hiệu năng giao diện và bộ nhớ khi render thư mục lớn.
  - **Các bước thực hiện:**
    - [x] Double click mở thư mục `big_dir` (chứa 10.000 file).
    - [x] Cuộn chuột thật nhanh từ đỉnh xuống đáy danh sách.
    - [x] Dùng ô tìm kiếm gõ lọc file `bulk_09999.txt`.
  - **Kết quả mong đợi:**
    - [x] Danh sách hiển thị mượt mà nhờ virtual scrolling, không lag đơ UI quá 1 giây.
    - [x] RAM của tiến trình webview không bị tăng vọt bất thường.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **DIR-05: Thư mục không có quyền đọc (`chmod 000`)**
  - **Mục tiêu:** Đảm bảo thông báo lỗi Permission Denied trực quan, không nuốt lỗi.
  - **Các bước thực hiện:**
    - [x] Trên remote pane, double click mở thư mục `locked_dir`.
  - **Kết quả mong đợi:**
    - [x] Bật alert thông báo lỗi `Permission Denied` (màu đỏ).
    - [x] Không đổi đường dẫn hiện tại sang thư mục rỗng trắng trơn.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **DIR-06: Thử nghiệm Path Traversal trên thanh Address Bar**
  - **Mục tiêu:** Ngăn chặn việc nhảy sai root path khi nhập đường dẫn thủ công.
  - **Các bước thực hiện:**
    - [x] Nhấp vào thanh địa chỉ remote, gõ: `../../../../etc` hoặc `/tmp/../etc`.
    - [x] Bấm Enter.
  - **Kết quả mong đợi:**
    - [x] Đường dẫn được hàm `normalize_remote_path` chuẩn hóa chính xác về `/etc`.
    - [x] Không gửi các chuỗi đường dẫn `/../..` thô lên SFTP server.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

### Module 3: Symlinks & Vòng Lặp Vô Tận (Symlink Traversal)

- [x] **LINK-01: Vòng lặp đệ quy qua Symlink (Infinite Symlink Loop)**
  - **Mục tiêu:** Đảm bảo walker download không bị kẹt trong vòng lặp vô tận `dir_a -> dir_b -> dir_a`.
  - **Các bước thực hiện:**
    - [x] Chọn thư mục `symlink_lab` trên Remote pane.
    - [x] Bấm **Download** về máy local.
  - **Kết quả mong đợi:**
    - [x] Hàm `collect_download_plan` phát hiện `ctype.is_symlink()` và bỏ qua thư mục `infinite_loop`.
    - [x] Ứng dụng KHÔNG bị tràn bộ nhớ (OOM), KHÔNG bị Stack Overflow hay freeze UI.
    - [x] Tải hoàn tất các file thông thường khác trong thư mục.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **LINK-02: Broken Symlink (Liên kết hỏng trỏ tới file không tồn tại)**
  - **Mục tiêu:** Kiểm tra ứng dụng khi gặp file symlink mất đích đến (`broken_link.txt`).
  - **Các bước thực hiện:**
    - [x] Mở thư mục `symlink_lab`, quan sát biểu tượng và thông tin của `broken_link.txt`.
    - [x] Thử chọn tải hoặc xem thuộc tính của file này.
  - **Kết quả mong đợi:**
    - [x] Danh sách hiển thị file bình thường (không làm crash cả bảng).
    - [x] Khi tương tác, hệ thống báo lỗi `No such file` gọn gàng.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **LINK-03: Ngăn chặn rò rỉ dữ liệu qua Symlink ngoài phạm vi**
  - **Mục tiêu:** Symlink trỏ ra `/etc/passwd` không được tự ý dereference kéo dữ liệu nhạy cảm về.
  - **Các bước thực hiện:**
    - [x] Download thư mục `symlink_lab`.
    - [x] Kiểm tra trên máy local xem có file `leak_link.txt` chứa nội dung file `/etc/passwd` hay không.
  - **Kết quả mong đợi:**
    - [x] Walker bỏ qua symlink; không đọc lén và tải nội dung của tệp đích ngoài ý muốn.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

### Module 4: Truyền tải Tệp, Hàng đợi & Giới hạn Concurrency

- [x] **CONC-01: Kiểm tra Giới hạn Concurrency (`MAX_CONCURRENT_TRANSFERS = 2`)**
  - **Mục tiêu:** Kiểm tra semaphore hàng đợi tải chỉ cho phép tối đa 2 tác vụ chạy cùng lúc.
  - **Các bước thực hiện:**
    - [x] Chọn cùng lúc 10 file (mỗi file 100MB) trên local và kéo sang remote upload.
    - [x] Mở rộng bảng `TransferQueue` bên dưới.
  - **Kết quả mong đợi:**
    - [x] Đúng **2 job** hiển thị trạng thái `RUNNING` (có tốc độ KB/s).
    - [x] **8 job** còn lại ở trạng thái `QUEUED`.
    - [x] Ngay khi 1 job hoàn thành, job thứ 3 lập tức chuyển sang `RUNNING`.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONC-02: Truyền tệp tin rỗng (0-Byte File)**
  - **Mục tiêu:** Kiểm tra xử lý trường hợp biên kích thước bằng 0 (`empty_0byte.bin`).
  - **Các bước thực hiện:**
    - [x] Upload và Download file `empty_0byte.bin`.
  - **Kết quả mong đợi:**
    - [x] Hoàn thành ngay lập tức với thanh tiến trình 100%.
    - [x] File tạo ra ở đích có kích thước chính xác 0 byte, không bị lỗi chia cho 0 (`division by zero` khi tính %).
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONC-03: File siêu lớn (5GB - 10GB) & Đo đạc rò rỉ RAM**
  - **Mục tiêu:** Kiểm tra chunk buffer stream (128KB) không tích tụ rác bộ nhớ.
  - **Các bước thực hiện:**
    - [x] Mở Task Manager (Windows) theo dõi tiến trình `core_term.exe`.
    - [x] Bắt đầu tải file `huge_5gb.bin`.
  - **Kết quả mong đợi:**
    - [x] Dung lượng RAM duy trì ổn định (quanh mức 150MB - 350MB), không tăng lũy tiến theo số GB tải.
    - [x] Tốc độ truyền tải và thanh tiến trình cập nhật đều đặn mỗi 150ms.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONC-04: Xoá tệp đã hoàn thành (Clear Finished) trong lúc hàng đợi đang chạy**
  - **Mục tiêu:** Kiểm tra race condition giữa mutex danh sách order và map các job.
  - **Các bước thực hiện:**
    - [x] Trong lúc 2 file đang chạy và 3 file đã xong, bấm liên tục nút **Clear Finished**.
  - **Kết quả mong đợi:**
    - [x] Chỉ xoá các job `COMPLETED`, các job `RUNNING` và `QUEUED` tiếp tục chạy bình thường, không bị văng khỏi hàng đợi.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

### Module 5: Xử lý Xung đột Tệp (Conflict Resolution & Resume)

- [x] **CONF-01: Giải quyết Xung đột: Ghi đè (OVERWRITE)**
  - **Mục tiêu:** Xác nhận ghi đè toàn bộ tệp tin đích từ byte 0.
  - **Các bước thực hiện:**
    - [x] Tải một file lên thư mục đã có sẵn file cùng tên (nội dung khác).
    - [x] Trong modal xung đột, bấm chọn **Overwrite**.
  - **Kết quả mong đợi:**
    - [x] File đích bị ghi đè hoàn toàn.
    - [x] Hash SHA256 file nguồn và đích khớp nhau 100%.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONF-02: Giải quyết Xung đột: Đổi tên tự động (RENAME)**
  - **Mục tiêu:** Kiểm tra hàm sinh tên mới dạng `name (1).ext`, `name (2).ext`.
  - **Các bước thực hiện:**
    - [x] Tạo sẵn `report.pdf` và `report (1).pdf` tại thư mục đích.
    - [x] Tải lên tệp `report.pdf` -> Chọn **Rename** trong modal xung đột.
  - **Kết quả mong đợi:**
    - [x] Hệ thống tự động đặt tên file mới thành `report (2).pdf`.
    - [x] File cũ không bị ảnh hưởng.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONF-03: Giải quyết Xung đột: Nối tiếp file dở dang (RESUME)**
  - **Mục tiêu:** Tải tiếp tệp tin từ offset dở dang thay vì tải lại từ đầu.
  - **Các bước thực hiện:**
    - [x] Bắt đầu tải file 1GB, khi đến 40% thì ngắt kết nối mạng (hoặc kill app).
    - [x] Kết nối lại, thực hiện lại lệnh tải file đó.
    - [x] Khi modal xung đột hiện lên, kiểm tra xem nút **Resume** có khả dụng không -> Bấm **Resume**.
  - **Kết quả mong đợi:**
    - [x] Quá trình tải tiếp tục ngay từ mốc 40% (offset ~400MB).
    - [x] Chạy lệnh `sha256sum` trên cả 2 máy sau khi tải xong: Mã hash **phải trùng khớp tuyệt đối**.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONF-04: Xung đột khi File Đích LỚN HƠN hoặc BẰNG File Nguồn**
  - **Mục tiêu:** Đảm bảo không cho phép Resume khi file đích đã lớn hơn file nguồn.
  - **Các bước thực hiện:**
    - [x] File nguồn có kích thước 100MB; File đích có kích thước 200MB.
    - [x] Thực hiện copy đè lên file đích.
  - **Kết quả mong đợi:**
    - [x] Modal xung đột **ẩn (disable) nút Resume**, chỉ cho phép Overwrite, Rename hoặc Skip.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONF-05: Áp dụng cho tất cả (Apply to all) trong xử lý xung đột hàng loạt**
  - **Mục tiêu:** Kiểm tra mutex `BatchConflictState` đồng bộ cho toàn bộ các file trong mẻ truyền tải.
  - **Các bước thực hiện:**
    - [x] Upload một thư mục chứa 20 file đều bị trùng tên ở máy đích.
    - [x] Khi modal đầu tiên hiện ra: Tick vào ô **Apply to all** -> Bấm **Skip** (hoặc **Rename**).
  - **Kết quả mong đợi:**
    - [x] Toàn bộ 19 file xung đột còn lại tự động thực hiện hành động đã chọn.
    - [x] **Không bật thêm bất kỳ modal xung đột nào khác**.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **CONF-06: Trùng tên với Thư mục (`dest_is_dir = true`)**
  - **Mục tiêu:** Ngăn chặn việc tải một file lẻ đè lên một thư mục có sẵn cùng tên.
  - **Các bước thực hiện:**
    - [x] Trên remote có thư mục tên `data`.
    - [x] Từ local, upload một file tệp tin cũng có tên là `data`.
  - **Kết quả mong đợi:**
    - [x] Ứng dụng báo lỗi Validation: *"Destination '...' already exists as a directory"*.
    - [x] Thư mục remote được bảo toàn nguyên vẹn, không bị lỗi filesystem.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

### Module 6: Tạm dừng (Pause), Tiếp tục (Resume) & Huỷ bỏ (Cancel)

- [x] **PIPE-01: Tạm dừng và Tiếp tục truyền tải (Pause / Resume)**
  - **Mục tiêu:** Kiểm tra token ngắt stream và khôi phục stream qua UI.
  - **Các bước thực hiện:**
    - [x] Đang tải file lớn ở tốc độ cao -> Bấm nút **Pause** trên hàng đợi.
    - [x] Chờ 5 giây quan sát.
    - [x] Bấm nút **Resume (Play)**.
  - **Kết quả mong đợi:**
    - [x] Ngay khi Pause: Tốc độ về 0 KB/s, trạng thái chuyển sang `PAUSED`.
    - [x] Khi Resume: Quá trình tiếp tục chạy từ byte hiện tại, không reset về 0%.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **PIPE-02: Phá hoại file trong lúc đang Tạm dừng (Tampering while paused)**
  - **Mục tiêu:** Kiểm tra phản ứng khi file đích bị can thiệp ngoài ý muốn lúc đang pause.
  - **Các bước thực hiện:**
    - [x] Đang download file về local, bấm **Pause** ở mốc 50%.
    - [x] Mở File Explorer, mở file dở dang đó và xoá bớt nội dung / hoặc xoá luôn file.
    - [x] Quay lại CoreTerm, bấm nút **Resume**.
  - **Kết quả mong đợi:**
    - [x] Ứng dụng xử lý lỗi IO an toàn, chuyển trạng thái sang `FAILED` kèm thông báo lỗi.
    - [x] Tuyệt đối không crash tiến trình Rust backend.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **PIPE-03: Huỷ tác vụ (Cancel) & Kiểm tra Giải phóng File Lock**
  - **Mục tiêu:** Đảm bảo file handle trên Windows được đóng ngay sau khi huỷ.
  - **Các bước thực hiện:**
    - [x] Đang tải file lớn ở mốc 25% -> Bấm nút **Cancel (X)** trên hàng đợi.
    - [x] Ngay lập tức mở File Explorer trên Windows, chọn file dở dang đó và bấm phím **Shift + Delete**.
  - **Kết quả mong đợi:**
    - [x] File xoá được ngay lập tức trên Windows.
    - [x] Windows KHÔNG báo lỗi: *"The action can't be completed because the file is open in another program"*.
  - **Trạng thái:** `[X] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **PIPE-04: Đầy ổ đĩa trong quá trình truyền tải (Disk Full / ENOSPC)**
  - **Mục tiêu:** Bắt mã lỗi thiếu dung lượng đĩa ghi an toàn.
  - **Các bước thực hiện:**
    - [ ] Tải một file 2GB vào một ổ đĩa USB / RAM Disk chỉ còn trống 100MB.
  - **Kết quả mong đợi:**
    - [ ] Khi chạm mốc hết dung lượng, tác vụ dừng lại với trạng thái `FAILED`.
    - [ ] Thông báo lỗi thể hiện rõ nguyên nhân thiếu dung lượng ổ đĩa.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [x] **PIPE-05: Đóng Tab khi có nhiều tác vụ đang tải dở**
  - **Mục tiêu:** Kiểm tra dọn dẹp hàng đợi và engine khi huỷ phiên tab.
  - **Các bước thực hiện:**
    - [x] Xếp hàng 5 file đang upload/download.
    - [x] Đóng Tab SFTP đó ngay lập tức.
  - **Kết quả mong đợi:**
    - [x] Tất cả tác vụ nền dừng ngay, tài nguyên mạng và file socket được giải phóng hoàn toàn.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

### Module 7: Thao tác Tệp & Quyền hạn POSIX (CRUD & Permissions)

- [ ] **CRUD-01: Chặn xoá Thư mục Gốc (`/` hoặc `C:/`)**
  - **Mục tiêu:** Bảo vệ an toàn hệ thống, tuyệt đối không xoá thư mục gốc.
  - **Các bước thực hiện:**
    - [ ] Thử gõ đường dẫn `/` và tìm cách gọi lệnh xoá.
  - **Kết quả mong đợi:**
    - [ ] Lệnh `delete_entries` chặn lại và trả về lỗi: *"Refusing to delete '/'"*.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **CRUD-02: Xoá đệ quy cây thư mục sâu và phức tạp**
  - **Mục tiêu:** Kiểm tra thuật toán xoá DFS ngăn xếp post-order trong `session.rs`.
  - **Các bước thực hiện:**
    - [ ] Tạo một thư mục có nhiều cấp con, xen kẽ file readonly (`chmod 444`), file ẩn.
    - [ ] Bấm chuột phải vào thư mục cha -> Chọn **Delete**.
  - **Kết quả mong đợi:**
    - [ ] Xác nhận modal cảnh báo xoá -> Toàn bộ thư mục con và tệp tin bên trong bị xoá sạch sẽ.
    - [ ] Bảng danh sách tự động refresh sau khi xoá xong.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **CRUD-03: Đổi tên tệp (Rename) với ký tự đặc biệt & Unicode**
  - **Mục tiêu:** Đảm bảo `sftpRename` xử lý tốt encoding UTF-8.
  - **Các bước thực hiện:**
    - [ ] Chọn một file -> Bấm **F2** hoặc chọn Rename từ Context Menu.
    - [ ] Nhập tên: `Báo cáo tài chính Q4 (bản sửa) #2026.docx`.
  - **Kết quả mong đợi:**
    - [ ] File đổi tên thành công, không bị lỗi font hay vỡ ký tự tiếng Việt.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **CRUD-04: Phân quyền Chmod với các giá trị biên và mã Octal dị biệt**
  - **Mục tiêu:** Kiểm tra hàm `validate_octal_mode` và phân quyền POSIX.
  - **Các bước thực hiện:**
    - [ ] Mở modal Chmod của một file:
      - Thử set quyền chuẩn: `755`, `644`, `777`, `000`.
      - Thử cố tình nhập giá trị không phải octal: `888`, `999`, hoặc lớn hơn `7777`.
  - **Kết quả mong đợi:**
    - [ ] Các quyền chuẩn cập nhật chính xác trên server (kiểm tra bằng `ls -l` trên terminal).
    - [ ] Giá trị `888`, `999` bị modal chặn và báo lỗi Octal không hợp lệ.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **CRUD-05: Tạo thư mục mới (New Folder) với tên trùng hoặc ký tự cấm**
  - **Mục tiêu:** Kiểm tra tính hợp lệ khi tạo thư mục qua modal.
  - **Các bước thực hiện:**
    - [ ] Bấm nút New Folder -> Nhập tên rỗng; hoặc tên chứa `/`, `\`, null byte.
    - [ ] Thử tạo thư mục trùng tên với một thư mục đã có.
  - **Kết quả mong đợi:**
    - [ ] Báo lỗi validation ngay trên modal, không gửi request sai lên server.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

### Module 8: Giao Diện Người Dùng, Kéo Thả & Điều Hướng

- [ ] **UI-01: Drag & Drop từ Windows File Explorer bên ngoài vào Remote Pane**
  - **Mục tiêu:** Kiểm tra xử lý sự kiện Native Drag & Drop của Tauri WebView.
  - **Các bước thực hiện:**
    - [ ] Mở File Explorer của Windows song song với CoreTerm.
    - [ ] Chọn 5 file bên ngoài -> Kéo thả thẳng vào vùng trống của Remote Pane.
  - **Kết quả mong đợi:**
    - [ ] Modal xác nhận chuyển tệp bật lên thể hiện đúng số lượng 5 file và thư mục đích.
    - [ ] Bấm xác nhận -> 5 file được đưa vào hàng đợi upload thành công.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **UI-02: Drag & Drop nội bộ giữa Local Pane và Remote Pane**
  - **Mục tiêu:** Kiểm tra tính năng kéo thả giữa 2 bảng chia đôi màn hình.
  - **Các bước thực hiện:**
    - [ ] Bật chế độ Split Pane (hiển thị cả Local và Remote).
    - [ ] Nắm một file từ Local kéo thả vào một hàng thư mục cụ thể trên Remote.
  - **Kết quả mong đợi:**
    - [ ] Hàng thư mục đích được highlight viền rõ ràng.
    - [ ] File được tải chính xác vào bên trong thư mục đích đó.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **UI-03: Điều hướng lịch sử bằng nút Chuột (Mouse 4 & Mouse 5)**
  - **Mục tiêu:** Kiểm tra hook `useSftpMouseNav` khi người dùng bấm nút hông chuột.
  - **Các bước thực hiện:**
    - [ ] Click mở lần lượt qua 3 cấp thư mục.
    - [ ] Bấm nút **Back (Chuột 4)** và **Forward (Chuột 5)** trên chuột máy tính.
  - **Kết quả mong đợi:**
    - [ ] Thư mục lùi lại và tiến lên đúng theo lịch sử di chuyển, tương tự Windows Explorer.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **UI-04: Phím tắt bàn phím (Delete, Multiselect với Ctrl/Shift)**
  - **Mục tiêu:** Kiểm tra tương tác bàn phím trên danh sách file.
  - **Các bước thực hiện:**
    - [ ] Giữ `Ctrl` chọn 5 file rời rạc; hoặc giữ `Shift` chọn dải 10 file liên tiếp.
    - [ ] Nhấn phím **Delete** trên bàn phím.
  - **Kết quả mong đợi:**
    - [ ] Bật modal xác nhận xoá đúng số lượng tệp đã chọn.
    - [ ] Không nhận phím tắt nhầm khi đang gõ chữ trong ô input/search.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **UI-05: Tính năng "Open in Terminal" với đường dẫn phức tạp**
  - **Mục tiêu:** Kiểm tra escape ký tự khi truyền lệnh `cd` sang PTY shell.
  - **Các bước thực hiện:**
    - [ ] Duyệt remote đến thư mục có tên quái chiêu: `/tmp/my project 'folder' & test$dir/`.
    - [ ] Bấm nút **Open in Terminal** trên toolbar.
  - **Kết quả mong đợi:**
    - [ ] Terminal mở ra và lệnh `cd` chuyển chính xác vào thư mục đó.
    - [ ] Không bị vỡ lệnh bash do dấu nháy đơn (`'`), khoảng trắng hay ký tự `&`.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **UI-06: Kéo thanh chia Split Pane kịch biên (0% và 100%)**
  - **Mục tiêu:** Kiểm tra responsive và ràng buộc min-width của splitter.
  - **Các bước thực hiện:**
    - [ ] Nắm thanh kéo giữa 2 Pane kéo kịch sang trái (0%) và kéo kịch sang phải (100%).
  - **Kết quả mong đợi:**
    - [ ] Giao diện không bị vỡ layout, không bị biến mất thanh chia khiến không kéo lại được.
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

- [ ] **UI-07: Context Menu đa dạng vùng click**
  - **Mục tiêu:** Kiểm tra hiển thị menu ngữ cảnh theo vị trí click chuột.
  - **Các bước thực hiện:**
    - [ ] Click phải vào 1 file đơn lẻ.
    - [ ] Click phải khi chọn nhiều file (multiselect).
    - [ ] Click phải vào vùng trống của bảng danh sách.
  - **Kết quả mong đợi:**
    - [ ] Menu hiển thị chính xác các action tương ứng (Upload/Download Count, Delete Count, New Folder, Refresh, Copy Path).
  - **Trạng thái:** `[ ] PASS` | `[ ] FAIL`
  - *Ghi chú lỗi:* 

---

## 🔍 Hướng dẫn So sánh Mã Hash Kiểm tra Toàn vẹn (Checksum)

Khi thực hiện các bài test liên quan đến **Resume**, **Overwrite**, hoặc **File lớn**, bắt buộc phải kiểm tra tính toàn vẹn từng byte:

- **Trên Windows (PowerShell):**
  ```powershell
  Get-FileHash -Algorithm SHA256 "D:\duong\dan\file_test.bin"
  ```
- **Trên Linux Remote Server:**
  ```bash
  sha256sum ~/sftp_hardcore_test/file_test.bin
  ```

👉 **Kết luận:** Nếu 2 chuỗi SHA256 **giống hệt nhau từng ký tự**, tính năng truyền tải và seek offset hoạt động chuẩn xác 100%.

---

## 🐞 Nhật Ký Lỗi Phát Hiện (Bug Tracker Mẫu)

| Bug ID | Test Case | Mô tả Lỗi & Triệu chứng | Mức độ (Critical/Major/Minor) | Trạng thái (Open/Fixed) |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | **AUTH-01** | Khi chọn "Luôn hỏi" (StrictHostKeyChecking=YES), backend truyền `StrictHostKeyChecking=yes` thay vì `ask` khiến OpenSSH ngắt kết nối với mã lỗi 255 thay vì hỏi người dùng. | **Major** | **Fixed** |
| **BUG-02** | **DIR-02** | `join_remote_path` tự ý `.trim()` tên file remote khiến file có dấu cách ở cuối (`trailing_space `) bị đổi tên thành `trailing_space`, dẫn tới lỗi `Stat: No such file` thay vì báo lỗi Windows validation. | **Medium** | **Fixed** |
| **BUG-03** | **DIR-04** | Khi tải lượng lớn file nhỏ (10.000 file), race condition giữa `sftpDownload` và event `COMPLETED` khiến các file hoàn thành siêu nhanh bị ghi đè ngược về `QUEUED` (sinh ra file ma), bấm Pause/Cancel thì backend báo `Transfer job not found`. | **Major** | **Fixed** |
| **BUG-04** | **PIPE-02** | 1) Khi Pause rồi xoá/sửa file dở dang, Resume tạo Sparse File (chèn byte `0x00`) thay vì báo lỗi.<br>2) Khi đang tải dở (active stream) mà xoá file trên Explorer, tiến trình vẫn tiếp tục ghi vào unlinked handle và báo hoàn thành ảo (mất file). | **High** | **Fixed** |
| | | | | |
| | | | | |

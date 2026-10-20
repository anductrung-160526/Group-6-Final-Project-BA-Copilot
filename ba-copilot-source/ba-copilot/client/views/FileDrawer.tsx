// SCR-04 Xem tệp (ngăn phải): xem trước, thông tin nguồn, tải về (FN-09, FN-10). Chủ sở hữu: A4.
// Cũng chứa các hàm định dạng dùng chung với FilesView.

import React from "react";
import { download, fileDownloadUrl, filePreviewUrl } from "../api.ts";
import type { FileItem } from "../../shared/types.ts";
import { Badge, Btn, Drawer, Empty, Icon, RowActions, fmtTime, useUI, type DeleteConfirm } from "../components/ui.tsx";

/** Câu hỏi xác nhận xoá tệp – dùng chung cho bảng Kho tài liệu và ngăn xem tệp. */
export const deleteConfirm = (file: FileItem): DeleteConfirm => ({
  title: "Xoá tệp?",
  message: `Xoá "${file.name}" khỏi kho? Tệp bị xoá khỏi máy chủ và không khôi phục được.`,
  okLabel: "Xoá tệp",
});

/** Loại tệp cho phép (khớp server/files.ts): Word, PDF, Excel, ảnh. */
export const ALLOWED_EXTS = [".docx", ".doc", ".xlsx", ".xls", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
export const ACCEPT = ALLOWED_EXTS.join(",");
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2026-10-18" → "18/10/2026". */
export const fmtDay = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "");

/** Nhãn loại tệp theo mime. */
export function kindLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Ảnh";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "Word";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel") return "Excel";
  return "Khác";
}

export const canPreview = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

/** Bỏ dấu, chữ thường – tìm "tai lieu" ra "Tài liệu". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export function useDownload() {
  const { toast } = useUI();
  return (f: FileItem) => download(fileDownloadUrl(f.id)).catch((e) => toast(e.message, "err"));
}

export function FileDrawer({
  file,
  moduleName,
  onClose,
  onEdit,
  onDelete,
}: {
  file: FileItem;
  moduleName: string;
  onClose: () => void;
  onEdit: () => void;
  /** Gọi sau khi người dùng đã xác nhận xoá (RowActions hỏi). */
  onDelete: () => void | Promise<unknown>;
}) {
  const dl = useDownload();
  const isPdf = file.mime === "application/pdf";
  const rows: [string, React.ReactNode][] = [
    ["Loại", kindLabel(file.mime)],
    ["Kích thước", fmtSize(file.size)],
    ["Module", moduleName],
    ["Người gửi", file.sender || <span className="muted">Chưa ghi</span>],
    ["Ngày nhận", fmtDay(file.receivedAt) || <span className="muted">Chưa ghi</span>],
    ["Ghi chú", file.note || <span className="muted">Không có</span>],
    ["Nguồn", file.source === "export" ? <Badge tone="violet">Bản xuất tự động</Badge> : "Tải lên"],
    ["Ngày lưu", fmtTime(file.createdAt)],
  ];
  return (
    <Drawer
      title={file.name}
      onClose={onClose}
      actions={
        <Btn size="sm" onClick={() => dl(file)} data-testid="drawer-download">
          <Icon name="download" size="sm" />
          Tải về
        </Btn>
      }
      footer={
        <RowActions
          variant="buttons"
          editLabel="Sửa thông tin"
          onEdit={onEdit}
          onDelete={onDelete}
          deleteConfirm={deleteConfirm(file)}
          testIds={{ edit: "drawer-edit", delete: "drawer-delete" }}
        />
      }
    >
      <div className="box box-accent" data-testid="file-preview">
        {isPdf ? (
          <iframe src={filePreviewUrl(file.id)} title={`Xem trước ${file.name}`} style={{ width: "100%", height: "60vh", border: 0 }} />
        ) : canPreview(file.mime) ? (
          <img src={filePreviewUrl(file.id)} alt={file.name} style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain", alignSelf: "center" }} />
        ) : (
          <Empty title="Tải về để xem">
            Tệp {kindLabel(file.mime)} không xem trước được trong trình duyệt.{" "}
            <button className="link" onClick={() => dl(file)}>
              Tải về
            </button>
          </Empty>
        )}
      </div>
      <h3>Thông tin nguồn</h3>
      <table className="tbl" data-testid="file-info">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row" className="nowrap">
                {k}
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Drawer>
  );
}

// SCR-04 Xem tệp (ngăn phải): xem trước, thông tin nguồn, tải về (FN-09, FN-10). Chủ sở hữu: A4.
// Cũng chứa các hàm định dạng dùng chung với FilesView.

import React from "react";
import { download, fileDownloadUrl, filePreviewUrl } from "../api.ts";
import type { FileItem } from "../../shared/types.ts";
import { Badge, Btn, Drawer, Empty, Icon, RowActions, fmtTime, useUI, type DeleteConfirm } from "../components/ui.tsx";

/** Câu hỏi xác nhận xoá tệp – dùng chung cho bảng Kho tài liệu và ngăn xem tệp. */
export const deleteConfirm = (file: FileItem): DeleteConfirm => ({
  title: "Delete file?",
  message: `Delete "${file.name}" from the repository? The file is removed from the server and cannot be restored.`,
  okLabel: "Delete file",
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
/** Ngày YYYY-MM-DD → MM/DD/YYYY (en-US). */
export const fmtDay = (d?: string | null) => (d ? usDate(d) : "");
const usDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return m && day ? `${m}/${day}/${y}` : d;
};

/** Nhãn loại tệp theo mime. */
export function kindLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "Word";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel") return "Excel";
  return "Other";
}

export const canPreview = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

/** Bỏ dấu, chữ thường – tìm "tai lieu" ra "Tài liệu". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase(); // vi-keep: bỏ dấu tiếng Việt khi tìm kiếm

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
    ["Type", kindLabel(file.mime)],
    ["Size", fmtSize(file.size)],
    ["Module", moduleName],
    ["Sender", file.sender || <span className="muted">Not recorded</span>],
    ["Received on", fmtDay(file.receivedAt) || <span className="muted">Not recorded</span>],
    ["Note", file.note || <span className="muted">None</span>],
    ["Source", file.source === "export" ? <Badge tone="violet">Automatic export</Badge> : "Upload"],
    ["Saved on", fmtTime(file.createdAt)],
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
          editLabel="Edit details"
          onEdit={onEdit}
          onDelete={onDelete}
          deleteConfirm={deleteConfirm(file)}
          testIds={{ edit: "drawer-edit", delete: "drawer-delete" }}
        />
      }
    >
      <div className="box box-accent" data-testid="file-preview">
        {isPdf ? (
          <iframe src={filePreviewUrl(file.id)} title={`Preview of ${file.name}`} style={{ width: "100%", height: "60vh", border: 0 }} />
        ) : canPreview(file.mime) ? (
          <img src={filePreviewUrl(file.id)} alt={file.name} style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain", alignSelf: "center" }} />
        ) : (
          <Empty title="Download to view">
            {kindLabel(file.mime)} files cannot be previewed in the browser.{" "}
            <button className="link" onClick={() => dl(file)}>
              Download
            </button>
          </Empty>
        )}
      </div>
      <h3>Source information</h3>
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

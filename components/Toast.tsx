"use client";

import { useEffect } from "react";

import { CheckIcon, XIcon } from "@/components/Icons";

export interface ToastState {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`toast toast--${toast.kind}`}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <span className="toast-icon" aria-hidden="true">
        {toast.kind === "success" ? <CheckIcon size={16} /> : null}
      </span>
      <span>{toast.message}</span>
      <button
        type="button"
        className="icon-btn"
        onClick={onDismiss}
        aria-label="关闭提示"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}

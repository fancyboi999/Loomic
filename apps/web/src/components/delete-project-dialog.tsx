"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
} from "./ui/dialog";
import { Button } from "./ui/button";

interface DeleteProjectDialogProps {
  open: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteProjectDialog({
  open,
  deleting,
  onConfirm,
  onCancel,
}: DeleteProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <p className="text-sm font-medium text-[#0E1014]">
          确定删除此项目？此操作无法撤销。
        </p>
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl"
          >
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-xl bg-[#FF595B] text-white hover:bg-[#E65052]"
          >
            {deleting ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                className="flex items-center justify-center"
              >
                <Loader2 size={16} />
              </motion.span>
            ) : "永久删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Promise-based replacement for window.confirm(), styled to match the app's
// AlertDialog instead of a native browser dialog (which blocks all page
// script execution until dismissed — see pos-only-live-qa-findings.md #4).
// Mirrors use-toast.ts's singleton-listener pattern: import `confirm`
// anywhere, no prop drilling; <ConfirmDialogHost /> is mounted once in App.tsx.
import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

let state: ConfirmState = { open: false, description: "", resolve: null };
const listeners: Array<(state: ConfirmState) => void> = [];

function setState(next: ConfirmState) {
  state = next;
  listeners.forEach((listener) => listener(state));
}

function settle(result: boolean) {
  state.resolve?.(result);
  setState({ ...state, open: false, resolve: null });
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    setState({ ...options, open: true, resolve });
  });
}

export function ConfirmDialogHost() {
  const [local, setLocal] = React.useState(state);

  React.useEffect(() => {
    listeners.push(setLocal);
    return () => {
      const index = listeners.indexOf(setLocal);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return (
    <AlertDialog open={local.open} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{local.title ?? "Are you sure?"}</AlertDialogTitle>
          <AlertDialogDescription>{local.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={local.variant !== "default" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {local.confirmLabel ?? "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

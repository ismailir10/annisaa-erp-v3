"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

interface Props {
  next: string;
}

export function LoginClient({ next }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      // The provider redirect lands on /auth/callback?code=... which exchanges
      // the PKCE code for a session and then redirects to ?next=. We forward
      // `next` here so the post-login destination survives the round trip.
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", next);
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });
      if (authError) {
        setError(authError.message);
        setBusy(false);
      }
      // On success the browser is already navigating to Google.
    } catch (err) {
      console.error("login: signInWithOAuth threw", err);
      setError("Tidak dapat memulai proses masuk. Mohon coba lagi.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masuk ke Portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gunakan akun Google sekolah Anda untuk masuk. Jika akun belum
          terdaftar, hubungi administrator sekolah.
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Gagal masuk</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          className="w-full"
          onClick={signInWithGoogle}
          disabled={busy}
          data-testid="login-google-button"
        >
          {busy ? "Mengarahkan ke Google…" : "Masuk dengan Google"}
        </Button>
      </CardContent>
    </Card>
  );
}

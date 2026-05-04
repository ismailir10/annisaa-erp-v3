import Link from 'next/link'

export const metadata = {
  title: 'An Nisaa Sekolahku — v2 Rebuild In Progress',
  description: 'School ERP v2 under active development. Launch July 2026.',
}

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-3xl font-semibold">An Nisaa Sekolahku</h1>
        <p className="text-base text-muted-foreground">
          Sistem versi 2 sedang dalam pengembangan. Peluncuran direncanakan Juli 2026.
        </p>
        <p className="text-sm text-muted-foreground">
          Untuk pendaftaran atau pertanyaan, hubungi kami via{' '}
          <a className="underline" href="https://wa.me/6287742646815">
            WhatsApp 0877-4264-6815
          </a>
        </p>
        <p className="text-xs text-muted-foreground">
          School ERP v2 rebuild — see{' '}
          <Link className="underline" href="https://github.com/ismailir10/school-erp">
            project repo
          </Link>
          .
        </p>
      </div>
    </main>
  )
}

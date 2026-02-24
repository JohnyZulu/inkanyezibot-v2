import './globals.css'

export const metadata = {
  title: 'Inkanyezi Technologies',
  description: 'AI Automation for South African Businesses',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
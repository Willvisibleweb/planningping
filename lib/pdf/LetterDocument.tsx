// Formal letter PDF layout. Server-only — @react-pdf/renderer depends on
// Node APIs (fontkit etc.) and must NEVER be imported from a Client
// Component (same restriction as lib/supabase/admin.ts's admin client).
//
// Deterministic template: the LLM never sees or drafts any of the
// letterhead/dateline/reference block below, only letterBody (see
// app/api/outreach/route.ts's LETTER_SYSTEM_PROMPT) — firm identity stays
// out of the prompt entirely.

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 11, fontFamily: 'Helvetica', color: '#111827', lineHeight: 1.5 },
  logo: { width: 120, marginBottom: 16, objectFit: 'contain' },
  letterheadLine: { fontSize: 10, color: '#374151' },
  dateline: { marginTop: 24, fontSize: 10, color: '#374151' },
  reference: { marginTop: 24, fontSize: 10, fontWeight: 700 },
  body: { marginTop: 16 },
  paragraph: { marginBottom: 10 },
})

export interface LetterDocumentProps {
  logo: { data: Buffer; format: 'png' | 'jpg' } | null
  businessName: string | null
  address: string | null
  phone: string | null
  contactEmail: string | null
  reference: string
  siteAddress: string | null
  letterBody: string
}

export default function LetterDocument({
  logo,
  businessName,
  address,
  phone,
  contactEmail,
  reference,
  siteAddress,
  letterBody,
}: LetterDocumentProps) {
  const dateline = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const addressLines = (address ?? '[Your business address]').split('\n').filter(Boolean)
  const paragraphs = letterBody.split(/\n+/).filter((p) => p.trim().length > 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {logo && <Image src={logo} style={styles.logo} />}

        <Text style={styles.letterheadLine}>{businessName ?? '[Your business name]'}</Text>
        {addressLines.map((line, i) => (
          <Text key={i} style={styles.letterheadLine}>{line}</Text>
        ))}
        <Text style={styles.letterheadLine}>{phone ?? '[Your phone number]'}</Text>
        <Text style={styles.letterheadLine}>{contactEmail ?? '[Your email address]'}</Text>

        <Text style={styles.dateline}>{dateline}</Text>

        <Text style={styles.reference}>
          Re: {reference}
          {siteAddress ? ` — ${siteAddress}` : ''}
        </Text>

        <View style={styles.body}>
          {paragraphs.map((paragraph, i) => (
            <Text key={i} style={styles.paragraph}>{paragraph}</Text>
          ))}
        </View>
      </Page>
    </Document>
  )
}

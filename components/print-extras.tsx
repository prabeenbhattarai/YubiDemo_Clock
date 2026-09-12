// Shared print-only extras for every exported PDF: the company logo watermark
// (sat behind the content) and the standard footer disclaimer. Both are hidden
// on screen and appear only when printing (see .print-watermark in globals.css
// and the `hidden print:block` utility on the disclaimer).

/** Company logo watermark. Place as the first child of a `.print-area`. */
export function PrintWatermark() {
  return (
    <div className="print-watermark" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" />
    </div>
  );
}

/** Standard footer disclaimer. Place as the last child of a `.print-area`. */
export function PrintDisclaimer() {
  return (
    <p
      className="hidden print:block"
      style={{
        marginTop: 24,
        paddingTop: 8,
        borderTop: "1px solid #e5e7eb",
        fontSize: 10,
        color: "#9ca3af",
        textAlign: "center",
      }}
    >
      This is a system-generated document and does not bear a signature. All data
      is system-generated and approved by an authorised person.
    </p>
  );
}

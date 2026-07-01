// Renders a <script type="application/ld+json"> tag with the given schema.org object.
// dangerouslySetInnerHTML is safe here — `data` is always a developer-authored constant object,
// never user input.
export function JsonLd({ data }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

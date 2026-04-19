export function JsonViewer({ value }: { value: unknown }) {
  return (
    <pre className="sf-obs-json-viewer">{JSON.stringify(value, null, 2)}</pre>
  );
}

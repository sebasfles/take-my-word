export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keys">
      {keys.map((key, index) => (
        <span key={key} className="keys-item">
          {index > 0 && <span className="keys-plus">+</span>}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

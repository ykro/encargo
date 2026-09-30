import { Contours } from "./Contours";

/** Empty and error states: a contour sketch, one sentence, one way forward. */
export function StateMessage({ title, text, action }: { title: string; text: string; action?: { href: string; label: string } }) {
  return (
    <section className="state">
      <Contours seed={11} lines={6} draw />
      <h1 className="display">{title}</h1>
      <p>{text}</p>
      {action && (
        <a href={action.href} className="btn ghost" style={{ width: "auto" }}>
          {action.label}
        </a>
      )}
    </section>
  );
}

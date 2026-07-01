import { useState } from 'react';

// Simple single-file accordion: plain React state + CSS, no dependency.
// `items` is an array of { question, answer } where answer can be a string or JSX node.
export default function Accordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="accordion">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div className={isOpen ? 'accordion-item open' : 'accordion-item'} key={item.question}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
            >
              <span>{item.question}</span>
              <span className="accordion-icon" aria-hidden="true">
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen && <div className="accordion-panel">{item.answer}</div>}
          </div>
        );
      })}
    </div>
  );
}

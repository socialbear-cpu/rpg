'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LoginTabletopMark } from './login-identity';

const highlights = [
  { title: 'A mesa está pronta.', description: 'Suas fichas, seus personagens e seus sistemas de RPG em um só lugar.', action: 'Escolher aventura', href: '#systems-title' },
  { title: 'Comece uma nova história.', description: 'Crie seu sistema, prepare as fichas e reúna seu grupo.', action: 'Forjar um sistema', href: '/dashboard/systems/new' },
  { title: 'Boas histórias pedem companhia.', description: 'Encontre seus amigos e prepare o próximo encontro do seu grupo.', action: 'Encontrar amigos', href: '/friends' },
];

export function RunicCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = highlights[activeSlide];

  return (
    <section className="runic-carousel" aria-label="Destaques do Bifrost" aria-roledescription="carrossel">
      <LoginTabletopMark />
      <div className="runic-carousel-copy" role="group" aria-roledescription="slide" aria-label={`Destaque ${activeSlide + 1} de ${highlights.length}`}>
        <div aria-live="polite" aria-atomic="true">
          <p className="runic-title">{slide.title}</p>
          <p className="runic-description">{slide.description}</p>
        </div>
        <Link className="runic-hero-action" href={slide.href}>{slide.action}<span aria-hidden="true">↗</span></Link>
      </div>
      <div className="runic-carousel-controls" aria-label="Navegação dos destaques">
        <button type="button" className="runic-arrow" aria-label="Destaque anterior" onClick={() => setActiveSlide((current) => (current + highlights.length - 1) % highlights.length)}>←</button>
        <div>{highlights.map((highlight, index) => <button key={highlight.href} className="runic-pagination" type="button" aria-label={`Mostrar destaque ${index + 1}`} aria-pressed={index === activeSlide} onClick={() => setActiveSlide(index)}><span /></button>)}</div>
        <span className="runic-slide-count" aria-hidden="true">0{activeSlide + 1} / 0{highlights.length}</span>
        <button type="button" className="runic-arrow" aria-label="Próximo destaque" onClick={() => setActiveSlide((current) => (current + 1) % highlights.length)}>→</button>
      </div>
    </section>
  );
}

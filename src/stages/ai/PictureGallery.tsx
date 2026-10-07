import { SceneArt } from './Art';
import { c, images } from './content';

/** `/dev/components` review sheet: every Stage 2 picture with its id, label and true box. */
export default function PictureGallery() {
  return (
    <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
      {images.map((img) => (
        <li key={img.id} style={{ fontSize: '0.875rem' }}>
          <div style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <SceneArt image={img} title={`${img.id}: ${c.labels[img.label]}`}>
              <rect x={img.box[0]} y={img.box[1]} width={img.box[2]} height={img.box[3]} fill="none" stroke="#ff00aa" strokeWidth="0.8" strokeDasharray="2 1.5" />
            </SceneArt>
          </div>
          <span>
            {img.id} · {c.labels[img.label]}
            {img.variant === 'night' ? ' · night' : ''}
            {img.tutorial ? ' · tutorial' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

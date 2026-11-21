import scene from '../../../content/reference/uk-scene.json';
import { Linked } from '../../ui/Linked';

/** UK contests, clubs and portable schemes for CW operators. */
export function UkScene() {
  return (
    <div class="mc-ukscene">
      <section class="mc-panel">
        <p>
          <Linked text={scene.about} />
        </p>
      </section>
      {scene.groups.map((g) => (
        <section key={g.title} class="mc-panel" aria-label={g.title}>
          <h2 class="mc-display">{g.title}</h2>
          <ul class="mc-scene-list">
            {g.items.map((it) => (
              <li key={it.name}>
                <div class="mc-scene-head">
                  <h3 class="mc-display">{it.name}</h3>
                  <span class="mc-label">{it.when}</span>
                </div>
                <p>
                  <Linked text={it.text} />
                </p>
                <p class="mc-help">
                  {'url' in it && it.url && (
                    <a href={it.url} target="_blank" rel="noopener">
                      Website
                    </a>
                  )}
                  {'url' in it && it.url && 'try' in it && it.try && ' · '}
                  {'try' in it && it.try && <a href={`#/shack?tab=${it.try}`}>{it.try === 'contest' ? 'Practise contests in the Shack' : 'Practise activations in the Shack'}</a>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

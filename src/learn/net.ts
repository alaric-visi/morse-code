import { makeCallsign } from './callsigns';
import { makeRadiogram, radiogramText, type Radiogram } from './radiogram';
import type { Rng } from './random';
import type { Operator } from './qso';

/**
 * A directed CW net. Net control (NCS) opens the net and takes check-ins (QNI);
 * traffic is listed (QTC) and NCS directs who takes it. Then the radiogram is
 * passed and receipted (QSL), and NCS closes the net.
 */
export interface NetStep {
  from: 'ncs' | 'relay' | 'you';
  text: string;
  /** For your turns: what must be in what you send. */
  expect?: string[];
  /** For a received radiogram: copy it into the form rather than free text. */
  form?: boolean;
}

export interface Net {
  name: string;
  ncs: string;
  relay: string;
  others: string[];
  radiogram: Radiogram;
  /** True: you pass a radiogram to the relay. False: the relay passes one to you. */
  youSend: boolean;
  steps: NetStep[];
}

const NETS = ['NORTH CW', 'EVENING CW', 'COUNTY TRAFFIC', 'SLOW SPEED CW'];

export function makeNet(me: Operator, rng: Rng, youSend: boolean, date = new Date()): Net {
  const call = () => makeCallsign(rng, { country: rng() < 0.7 ? 'England' : 'Scotland', portable: false }).call;
  const ncs = call();
  const relay = call();
  const others = [call(), call()];
  const name = NETS[Math.floor(rng() * NETS.length)];
  const r = youSend ? makeRadiogram(rng, { station: me.call, place: me.qth }, date) : makeRadiogram(rng, { station: relay }, date);
  const qni = `QNI ${others.join(' ')} ${me.call}`;
  const steps: NetStep[] = [{ from: 'ncs', text: `QST QST QST DE ${ncs} ${ncs} = ${name} NET NOW OPEN = QNI? K` }];
  if (youSend) {
    steps.push(
      { from: 'you', text: `DE ${me.call} QTC 1 ${r.city} K`, expect: [me.call, 'QTC'] },
      { from: 'ncs', text: `${me.call} R = ${qni} = ${relay} TAKE ${me.call} TFC FOR ${r.city} K` },
      { from: 'relay', text: `${me.call} DE ${relay} QRV K` },
      { from: 'you', text: radiogramText(r), expect: [String(r.number), String(r.check), r.signature] },
      { from: 'relay', text: `QSL NR ${r.number} TU ${me.call} DE ${relay}` },
    );
  } else {
    steps.push(
      { from: 'you', text: `DE ${me.call} K`, expect: [me.call] },
      { from: 'ncs', text: `${me.call} R = ${qni} = ${relay} QTC 1 FOR ${me.call} = ${relay} SEND K` },
      { from: 'relay', text: radiogramText(r), form: true },
      { from: 'you', text: `QSL NR ${r.number} TU ${relay} DE ${me.call}`, expect: ['QSL', String(r.number)] },
    );
  }
  steps.push({ from: 'ncs', text: `QNI TU ALL = NO FURTHER TFC = ${name} NET CLOSED = 73 DE ${ncs} <SK>` });
  return { name, ncs, relay, others, radiogram: r, youSend, steps };
}

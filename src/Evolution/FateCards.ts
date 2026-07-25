import type WorldEnvironment from '../Environments/WorldEnvironment';
import type { ParamChanges } from '../Environments/WorldEnvironment';

/* The Fate Deck -- concepts/evolution-window-overhauls.md, overhaul 4.

   A card is a named, illustrated bundle of parameter changes with a stated
   consequence: authorship of *events* rather than authorship of settings. "I
   played the Long Winter and the movers went extinct" is a story; "I set
   lifespanMultiplier to 300" is not, and it is the same write.

   The guardrail every card here is built to, from the doc: a card is a
   **pressure**, never a **result**. It changes what the world rewards; it never
   places or removes a particular organism, and it never names a species, a
   trait or a cell type. The Great Cull is the one card that touches bodies
   directly and it is allowed only because it is indiscriminate -- see the note
   on it, and on cullPopulation() in WorldEnvironment.

   Effects are deliberately blunt. A card that moves a parameter ten percent is
   a slider with a picture on it; these are meant to be legible in the world
   within a few hundred ticks of being played. */

export type CardTone = 'cold' | 'hot' | 'dark' | 'verdant';

export interface FateCard {
    /** Also the WorldEvent kind a timed card's shift runs under */
    id: string;
    /** Title case: the card face uppercases it, the toast doesn't */
    name: string;
    glyph: string;
    tone: CardTone;
    /** The lines printed on the card face, in the player's terms */
    rules: string[];
    flavor: string;
    /* How long the pressure holds, in ticks. 0 means the card lands once and
       never reverts -- either because it is instantaneous (the Cull) or because
       it changed a rule rather than the weather (Green Sun). Only a card with
       ticks > 0 has a live event to show a countdown for. */
    ticks: number;
    apply(env: WorldEnvironment): void;
}

/* Half of everything, which is the largest cull that still reliably leaves a
   world to recover -- and the figure the concept art prints on the card. */
const CULL_FRACTION = 0.5;

/* One announcement format for the whole deck, so playing a card lands in the
   same channel, and reads in the same voice, as the weather it sits beside
   ('✿ Bloom — food is flourishing'). */
function announce(card: Pick<FateCard, 'glyph' | 'name' | 'flavor'>): string {
    return `${card.glyph} ${card.name} — ${card.flavor}`;
}

/* A card whose entire effect is a bundle of parameter changes -- every card but
   the Cull. Declared as data and given its apply() here, so the announcement is
   composed once and the deck cannot grow a card that plays silently.

   Every one of these routes through triggerParamShift, which owns the awkward
   parts: capturing the pre-card baselines, extending rather than stacking when
   a live card is replayed, cancelling any other card holding the same field,
   and winding back on expiry, on reset and on world load. */
interface PressureSpec extends Omit<FateCard, 'apply'> {
    changes: ParamChanges;
}

function pressure(spec: PressureSpec): FateCard {
    const { changes, ...card } = spec;
    return {
        ...card,
        apply: env => env.triggerParamShift(card.id, changes, card.ticks, announce(card)),
    };
}

/* Named rather than inlined so its own apply() can reach its glyph and name for
   the toast; the engine appends the body count. */
const GREAT_CULL: FateCard = {
    id: 'great-cull',
    name: 'The Great Cull',
    glyph: '☠',
    tone: 'dark',
    rules: ['half of everything dies', 'once, immediately'],
    flavor: 'room to breathe',
    ticks: 0,
    /* The deck's one exception, and it earns it by being blind: an independent
       coin flip per organism, weighted by nothing. What it applies is a
       bottleneck -- the survivors are a random sample, so what comes back is
       decided by what happens to them next, not by what the player picked. */
    apply: env => { env.cullPopulation(CULL_FRACTION, `${GREAT_CULL.glyph} ${GREAT_CULL.name}`); },
};

export const FATE_CARDS: FateCard[] = [
    /* The archetypal era card: lean years that reward efficiency, and lives long
       enough to spend growing. The two halves pull against each other, which is
       the point -- food is scarce but there is time to build a body worth
       feeding. */
    pressure({
        id: 'long-winter',
        name: 'The Long Winter',
        glyph: '❄',
        tone: 'cold',
        rules: ['lifespan ×3', 'food production ÷2'],
        flavor: 'survivors get bigger',
        ticks: 3000,
        changes: { lifespanMultiplier: { mul: 3 }, foodProdProb: { mul: 0.5 } },
    }),
    /* Mutation rate five times over, and forced global so it bites every lineage
       at once instead of only the ones that happened to evolve a high rate.
       Both fields are restored together, so a world running on evolved rates
       goes back to them when the era ends. */
    pressure({
        id: 'hair-trigger',
        name: 'Hair Trigger',
        glyph: '⚡',
        tone: 'hot',
        rules: ['mutation rate ×5', 'shared by every lineage'],
        flavor: 'everything changes at once',
        ticks: 2000,
        changes: { useGlobalMutability: { set: true }, globalMutability: { mul: 5 } },
    }),
    GREAT_CULL,
    /* A glut you can actually breed into. The food multiplier alone tends to
       carpet the world and then choke reproduction on its own abundance --
       foodBlocksReproduction is on by default -- so lifting that is what turns
       the glut into a boom rather than a traffic jam. Shares foodProdProb with
       the Long Winter and with the weather, so those cancel each other; a
       fertile crescent inside an ice age was never going to mean anything. */
    pressure({
        id: 'fertile-crescent',
        name: 'Fertile Crescent',
        glyph: '✿',
        tone: 'verdant',
        rules: ['food production ×2.5', 'food never blocks birth'],
        flavor: 'a golden age, briefly',
        ticks: 1500,
        changes: { foodProdProb: { mul: 2.5 }, foodBlocksReproduction: { set: false } },
    }),
    /* Violence made lethal rather than attritional: with one-touch kill on, a
       single killer cell ends a body outright, so the only answers are armour,
       distance or speed. The wider blast is the second half of the same
       argument -- crowding stops being safe. */
    pressure({
        id: 'predators-gift',
        name: 'The Predator’s Gift',
        glyph: '🜏',
        tone: 'dark',
        rules: ['one touch kill ON', 'explosion radius +2'],
        flavor: 'armour, or nothing',
        ticks: 2500,
        changes: { instaKill: { set: true }, explosionRadius: { add: 2 } },
    }),
    /* Sight collapses and moving costs more, which between them stop paying for
       an eye-and-mover body and hand the era to the things that sit still. An
       absolute look range rather than a multiplier: the card names a number the
       player can picture, and `set` restores cleanly whatever the world was
       tuned to. */
    pressure({
        id: 'long-night',
        name: 'The Long Night',
        glyph: '☾',
        tone: 'cold',
        rules: ['look range → 4 cells', 'mover upkeep +3'],
        flavor: 'eyes stop paying rent',
        ticks: 2400,
        changes: { lookRange: { set: 4 }, extraMoverFoodCost: { add: 3 } },
    }),
    /* The one permanent card: not weather but physics. Producers on a mover are
       inert by default, which quietly forbids the entire farmer-that-walks body
       plan; switching it on doesn't push the world anywhere, it opens a design
       space that was closed. Permanent cards must be expressible in `set`
       transforms alone -- there is no event to wind this back, so replaying it
       has to be a no-op, and it is. */
    pressure({
        id: 'green-sun',
        name: 'Green Sun',
        glyph: '☀',
        tone: 'verdant',
        rules: ['movers can produce ON', 'permanent — a rule, not weather'],
        flavor: 'the animals learn to farm',
        ticks: 0,
        changes: { moversCanProduce: { set: true } },
    }),
];

/* Ticks left on a card's pressure, 0 when it isn't running. Derived per call
   rather than stored anywhere: ends_at is absolute, so this is a subtraction,
   and a card with no window can never be live. */
export function cardTicksLeft(card: FateCard, env: WorldEnvironment | null | undefined): number {
    if (!env || card.ticks <= 0) return 0;
    const ev = env.active_events.find(e => e.kind === card.id);
    return ev ? Math.max(0, ev.ends_at - env.total_ticks) : 0;
}

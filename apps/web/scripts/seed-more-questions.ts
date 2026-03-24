/**
 * Seeds additional EASA PPL questions across multiple subjects for manual eval.
 * Run AFTER seed-admin-eval.ts.
 *
 * Usage: cd apps/web && pnpm exec tsx scripts/seed-more-questions.ts
 */

import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: resolve(import.meta.dirname ?? '.', '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const isLocal =
  SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
if (!isLocal) {
  console.error('Refusing to seed against non-local Supabase URL')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type SubjectSeed = {
  code: string
  name: string
  short: string
  sortOrder: number
  topics: {
    code: string
    name: string
    subtopics: {
      code: string
      name: string
      questions: {
        num: string
        text: string
        a: string
        b: string
        c: string
        d: string
        correct: 'a' | 'b' | 'c' | 'd'
        explanation: string
      }[]
    }[]
  }[]
}

const SUBJECTS: SubjectSeed[] = [
  {
    code: '010',
    name: 'Air Law',
    short: 'ALW',
    sortOrder: 1,
    topics: [
      {
        code: '010-01',
        name: 'International law and organisations',
        subtopics: [
          {
            code: '010-01-01',
            name: 'The Chicago Convention',
            questions: [
              {
                num: 'ALW-001',
                text: 'The Chicago Convention was signed in:',
                a: '1919',
                b: '1944',
                c: '1958',
                d: '1972',
                correct: 'b',
                explanation:
                  'The Convention on International Civil Aviation (Chicago Convention) was signed on 7 December 1944.',
              },
              {
                num: 'ALW-002',
                text: 'ICAO was established by which convention?',
                a: 'Warsaw',
                b: 'Tokyo',
                c: 'Chicago',
                d: 'Montreal',
                correct: 'c',
                explanation: 'ICAO was established by the Chicago Convention of 1944.',
              },
              {
                num: 'ALW-003',
                text: 'How many Annexes does the Chicago Convention have?',
                a: '15',
                b: '17',
                c: '19',
                d: '21',
                correct: 'c',
                explanation:
                  'The Chicago Convention has 19 Annexes covering various aspects of international civil aviation.',
              },
              {
                num: 'ALW-004',
                text: 'Personnel licensing is covered by which ICAO Annex?',
                a: 'Annex 1',
                b: 'Annex 2',
                c: 'Annex 6',
                d: 'Annex 8',
                correct: 'a',
                explanation: 'Annex 1 covers Personnel Licensing.',
              },
              {
                num: 'ALW-005',
                text: 'Rules of the Air are found in which ICAO Annex?',
                a: 'Annex 1',
                b: 'Annex 2',
                c: 'Annex 3',
                d: 'Annex 11',
                correct: 'b',
                explanation: 'Annex 2 covers Rules of the Air.',
              },
            ],
          },
          {
            code: '010-01-02',
            name: 'EASA and national authorities',
            questions: [
              {
                num: 'ALW-006',
                text: 'EASA stands for:',
                a: 'European Air Safety Agency',
                b: 'European Aviation Safety Agency',
                c: 'European Aviation Standards Authority',
                d: 'European Air Standards Agency',
                correct: 'b',
                explanation:
                  'EASA is the European Union Aviation Safety Agency (formerly European Aviation Safety Agency).',
              },
              {
                num: 'ALW-007',
                text: 'EASA is headquartered in:',
                a: 'Brussels',
                b: 'Paris',
                c: 'Cologne',
                d: 'Amsterdam',
                correct: 'c',
                explanation: 'EASA headquarters is located in Cologne, Germany.',
              },
              {
                num: 'ALW-008',
                text: 'An EASA PPL(A) is valid in:',
                a: 'The issuing state only',
                b: 'All EASA member states',
                c: 'All ICAO states',
                d: 'EU states only',
                correct: 'b',
                explanation:
                  'An EASA PPL(A) is valid in all EASA member states without validation.',
              },
            ],
          },
        ],
      },
      {
        code: '010-02',
        name: 'Airworthiness of aircraft',
        subtopics: [
          {
            code: '010-02-01',
            name: 'Certificates of airworthiness',
            questions: [
              {
                num: 'ALW-009',
                text: 'A Certificate of Airworthiness is issued by:',
                a: 'The aircraft manufacturer',
                b: 'The operator',
                c: 'The state of registry',
                d: 'ICAO',
                correct: 'c',
                explanation: 'The C of A is issued by the state of registry of the aircraft.',
              },
              {
                num: 'ALW-010',
                text: 'The minimum documents to be carried on an international flight include:',
                a: 'C of A only',
                b: 'C of A and C of R',
                c: 'C of A, C of R, and journey logbook',
                d: 'C of A, C of R, journey logbook, and radio licence',
                correct: 'd',
                explanation:
                  'ICAO requires the C of A, C of R, journey logbook, radio licence, and crew licences.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '020',
    name: 'Aircraft General Knowledge',
    short: 'AGK',
    sortOrder: 2,
    topics: [
      {
        code: '020-01',
        name: 'Airframe and systems',
        subtopics: [
          {
            code: '020-01-01',
            name: 'Fuselage, wings and stabilising surfaces',
            questions: [
              {
                num: 'AGK-001',
                text: 'The main spar of a wing is designed to resist:',
                a: 'Torsion loads',
                b: 'Bending loads',
                c: 'Compression loads only',
                d: 'Drag loads',
                correct: 'b',
                explanation:
                  'The main spar is the primary structural member resisting bending loads.',
              },
              {
                num: 'AGK-002',
                text: 'A semi-monocoque fuselage uses:',
                a: 'Skin only for structural strength',
                b: 'Frames and stringers with a stressed skin',
                c: 'A truss structure covered by fabric',
                d: 'Honeycomb panels only',
                correct: 'b',
                explanation:
                  'Semi-monocoque construction uses frames, stringers, and stressed skin sharing loads.',
              },
              {
                num: 'AGK-003',
                text: 'Wing dihedral provides:',
                a: 'Directional stability',
                b: 'Longitudinal stability',
                c: 'Lateral stability',
                d: 'Speed stability',
                correct: 'c',
                explanation:
                  'Dihedral is the upward angle of the wings which provides lateral (roll) stability.',
              },
              {
                num: 'AGK-004',
                text: 'Ailerons are located on the:',
                a: 'Horizontal stabiliser',
                b: 'Vertical stabiliser',
                c: 'Trailing edge of each wing',
                d: 'Leading edge of each wing',
                correct: 'c',
                explanation:
                  'Ailerons are hinged control surfaces on the trailing edge of each wing, near the tips.',
              },
            ],
          },
          {
            code: '020-01-02',
            name: 'Landing gear',
            questions: [
              {
                num: 'AGK-005',
                text: 'In a tricycle undercarriage, the nosewheel is:',
                a: 'The main load-bearing wheel',
                b: 'Steerable on most aircraft',
                c: 'Positioned behind the main gear',
                d: 'Fixed and non-steerable',
                correct: 'b',
                explanation: 'The nosewheel is typically steerable, linked to the rudder pedals.',
              },
              {
                num: 'AGK-006',
                text: 'Oleo struts absorb landing loads using:',
                a: 'Springs only',
                b: 'Rubber bungees',
                c: 'Oil and compressed gas',
                d: 'Hydraulic fluid only',
                correct: 'c',
                explanation:
                  'Oleo (oleo-pneumatic) struts use oil forced through an orifice plus compressed nitrogen gas.',
              },
            ],
          },
        ],
      },
      {
        code: '020-02',
        name: 'Electrics',
        subtopics: [
          {
            code: '020-02-01',
            name: 'Direct current',
            questions: [
              {
                num: 'AGK-007',
                text: 'Most light aircraft use a DC electrical system of:',
                a: '12V',
                b: '14V or 28V',
                c: '24V',
                d: '115V',
                correct: 'b',
                explanation:
                  'Light aircraft typically use 14V (12V battery) or 28V (24V battery) DC systems.',
              },
              {
                num: 'AGK-008',
                text: 'The alternator is driven by:',
                a: 'An electric motor',
                b: 'The engine',
                c: 'The battery',
                d: 'A hydraulic pump',
                correct: 'b',
                explanation:
                  'The alternator is mechanically driven by the engine via a belt or gear.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '030',
    name: 'Flight Performance and Planning',
    short: 'FPP',
    sortOrder: 3,
    topics: [
      {
        code: '030-01',
        name: 'Mass and balance',
        subtopics: [
          {
            code: '030-01-01',
            name: 'Loading limitations',
            questions: [
              {
                num: 'FPP-001',
                text: 'The maximum take-off mass is found in the:',
                a: 'Operations manual',
                b: 'Aircraft flight manual (AFM)',
                c: 'AIP',
                d: 'Type certificate',
                correct: 'b',
                explanation: 'MTOM and all loading limitations are specified in the AFM.',
              },
              {
                num: 'FPP-002',
                text: 'If the CG is aft of the rear limit:',
                a: 'Stall speed increases',
                b: 'The aircraft becomes more stable',
                c: 'Longitudinal stability decreases',
                d: 'Range increases',
                correct: 'c',
                explanation:
                  'Aft CG reduces the tail moment arm, decreasing longitudinal stability and potentially making the aircraft uncontrollable.',
              },
              {
                num: 'FPP-003',
                text: 'The datum for moment calculations is:',
                a: 'Always the firewall',
                b: 'Always the nose',
                c: 'Defined by the manufacturer',
                d: 'The main gear position',
                correct: 'c',
                explanation:
                  'The datum is an arbitrary reference point chosen by the manufacturer, stated in the AFM.',
              },
              {
                num: 'FPP-004',
                text: 'Basic Empty Mass includes:',
                a: 'Crew and usable fuel',
                b: 'Airframe, engine, unusable fluids, and fixed equipment',
                c: 'Airframe only',
                d: 'Everything except payload',
                correct: 'b',
                explanation:
                  'BEM = airframe + engine + fixed equipment + unusable fuel and oil + other unusable fluids.',
              },
            ],
          },
        ],
      },
      {
        code: '030-02',
        name: 'Performance',
        subtopics: [
          {
            code: '030-02-01',
            name: 'Take-off and landing performance',
            questions: [
              {
                num: 'FPP-005',
                text: 'Take-off distance increases with:',
                a: 'Headwind',
                b: 'Lower temperature',
                c: 'Higher altitude',
                d: 'Lower mass',
                correct: 'c',
                explanation:
                  'Higher altitude = lower air density = less engine power and less lift = longer take-off distance.',
              },
              {
                num: 'FPP-006',
                text: 'A tailwind component on landing:',
                a: 'Decreases landing distance',
                b: 'Increases landing distance',
                c: 'Has no effect',
                d: 'Improves braking',
                correct: 'b',
                explanation:
                  'A tailwind increases groundspeed at touchdown, significantly increasing landing distance.',
              },
              {
                num: 'FPP-007',
                text: 'Density altitude is pressure altitude corrected for:',
                a: 'Wind',
                b: 'Humidity only',
                c: 'Non-standard temperature',
                d: 'Runway slope',
                correct: 'c',
                explanation:
                  'Density altitude = pressure altitude corrected for non-ISA temperature deviation.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '040',
    name: 'Human Performance',
    short: 'HPL',
    sortOrder: 4,
    topics: [
      {
        code: '040-01',
        name: 'Human factors and limitations',
        subtopics: [
          {
            code: '040-01-01',
            name: 'Vision',
            questions: [
              {
                num: 'HPL-001',
                text: 'Night vision primarily uses which type of retinal cells?',
                a: 'Cones',
                b: 'Rods',
                c: 'Bipolar cells',
                d: 'Ganglion cells',
                correct: 'b',
                explanation:
                  'Rods are sensitive to low light levels and are used for night (scotopic) vision.',
              },
              {
                num: 'HPL-002',
                text: 'The blind spot in the eye is caused by:',
                a: 'A damaged retina',
                b: 'The fovea',
                c: 'The optic nerve exit point',
                d: 'The iris',
                correct: 'c',
                explanation:
                  'The blind spot is where the optic nerve exits the retina — there are no photoreceptors there.',
              },
              {
                num: 'HPL-003',
                text: 'Full dark adaptation takes approximately:',
                a: '5 minutes',
                b: '10 minutes',
                c: '20-30 minutes',
                d: '1 hour',
                correct: 'c',
                explanation:
                  'Full dark adaptation (rod adaptation) takes approximately 20-30 minutes.',
              },
            ],
          },
          {
            code: '040-01-02',
            name: 'Hearing and balance',
            questions: [
              {
                num: 'HPL-004',
                text: 'Spatial disorientation is most likely in:',
                a: 'Clear VMC',
                b: 'IMC or at night',
                c: 'Strong headwinds',
                d: 'Turbulence only',
                correct: 'b',
                explanation:
                  'Spatial disorientation is most common in IMC or dark nights when visual references are lost.',
              },
              {
                num: 'HPL-005',
                text: 'The "leans" is caused by:',
                a: 'Fatigue',
                b: 'A slow roll rate below the vestibular threshold',
                c: 'Low blood pressure',
                d: 'Incorrect altimeter setting',
                correct: 'b',
                explanation:
                  'The leans occur when a slow roll goes undetected by the semicircular canals, then a corrective roll is sensed, creating a false sensation.',
              },
            ],
          },
        ],
      },
      {
        code: '040-02',
        name: 'Aviation psychology',
        subtopics: [
          {
            code: '040-02-01',
            name: 'Decision making and judgement',
            questions: [
              {
                num: 'HPL-006',
                text: 'The IMSAFE checklist assesses:',
                a: 'Aircraft condition',
                b: 'Pilot fitness to fly',
                c: 'Weather conditions',
                d: 'Route planning',
                correct: 'b',
                explanation:
                  'IMSAFE = Illness, Medication, Stress, Alcohol, Fatigue, Emotion — a pilot self-assessment.',
              },
              {
                num: 'HPL-007',
                text: 'Confirmation bias in aviation means:',
                a: 'Confirming ATC instructions',
                b: 'Seeking information that supports an existing belief',
                c: 'Double-checking instruments',
                d: 'Confirming weather reports',
                correct: 'b',
                explanation:
                  'Confirmation bias is the tendency to seek or interpret information that confirms pre-existing beliefs while ignoring contradictory evidence.',
              },
            ],
          },
        ],
      },
    ],
  },
  // MET — add more questions to existing subject
  {
    code: '050',
    name: 'Meteorology',
    short: 'MET',
    sortOrder: 5,
    topics: [
      {
        code: '050-01',
        name: 'The atmosphere',
        subtopics: [
          {
            code: '050-01-01',
            name: 'Composition and extent',
            questions: [
              {
                num: 'MET-001',
                text: 'The troposphere extends to approximately:',
                a: '6 km at the poles',
                b: '8 km at the poles to 18 km at the equator',
                c: '20 km everywhere',
                d: '36,000 ft everywhere',
                correct: 'b',
                explanation:
                  'The tropopause varies from about 8 km at the poles to 18 km at the equator.',
              },
              {
                num: 'MET-002',
                text: 'ISA sea-level temperature is:',
                a: '10°C',
                b: '15°C',
                c: '20°C',
                d: '25°C',
                correct: 'b',
                explanation: 'ISA standard sea-level conditions: 15°C, 1013.25 hPa.',
              },
              {
                num: 'MET-003',
                text: 'The ISA temperature lapse rate in the troposphere is:',
                a: '1°C/100m',
                b: '2°C/1000ft',
                c: '6.5°C/1000m',
                d: '3°C/1000ft',
                correct: 'b',
                explanation:
                  'The ISA lapse rate is approximately 2°C per 1000 ft (or 6.5°C per 1000 m).',
              },
              {
                num: 'MET-004',
                text: 'Approximately what percentage of the atmosphere is nitrogen?',
                a: '21%',
                b: '50%',
                c: '68%',
                d: '78%',
                correct: 'd',
                explanation:
                  'The atmosphere is approximately 78% nitrogen, 21% oxygen, and 1% other gases.',
              },
              {
                num: 'MET-005',
                text: 'The tropopause is characterised by:',
                a: 'Increasing temperature',
                b: 'A temperature lapse rate close to zero',
                c: 'Maximum wind speeds always',
                d: 'Constant humidity',
                correct: 'b',
                explanation:
                  'The tropopause marks the boundary where the temperature lapse rate drops to near zero.',
              },
            ],
          },
        ],
      },
      {
        code: '050-02',
        name: 'Wind',
        subtopics: [
          {
            code: '050-02-01',
            name: 'General circulation',
            questions: [
              {
                num: 'MET-006',
                text: 'The Coriolis force deflects wind to the:',
                a: 'Left in the Northern Hemisphere',
                b: 'Right in the Northern Hemisphere',
                c: 'Right in the Southern Hemisphere',
                d: 'Same direction in both hemispheres',
                correct: 'b',
                explanation:
                  'The Coriolis force deflects moving air to the right in the Northern Hemisphere and left in the Southern.',
              },
              {
                num: 'MET-007',
                text: 'Surface wind compared to gradient wind is:',
                a: 'Faster and backed',
                b: 'Slower and veered',
                c: 'Slower and backed (Northern Hemisphere)',
                d: 'Faster and veered',
                correct: 'c',
                explanation:
                  'Surface friction reduces wind speed and causes it to back (turn anticlockwise in NH) compared to the gradient wind.',
              },
              {
                num: 'MET-008',
                text: 'A sea breeze blows from:',
                a: 'Land to sea by day',
                b: 'Sea to land by day',
                c: 'Sea to land by night',
                d: 'Along the coast',
                correct: 'b',
                explanation:
                  'During the day, land heats faster than sea, air rises over land, and cooler sea air flows inland.',
              },
            ],
          },
        ],
      },
      {
        code: '050-03',
        name: 'Clouds and precipitation',
        subtopics: [
          {
            code: '050-03-01',
            name: 'Cloud types',
            questions: [
              {
                num: 'MET-009',
                text: 'Cumulonimbus clouds are associated with:',
                a: 'Drizzle only',
                b: 'Thunderstorms, hail, and turbulence',
                c: 'Steady rain',
                d: 'Clear skies',
                correct: 'b',
                explanation:
                  'CB clouds produce thunderstorms, lightning, heavy rain, hail, severe turbulence, and wind shear.',
              },
              {
                num: 'MET-010',
                text: 'Stratus clouds form by:',
                a: 'Convective lifting',
                b: 'Orographic lifting only',
                c: 'Widespread gradual lifting or cooling',
                d: 'Frontal activity only',
                correct: 'c',
                explanation:
                  'Stratus is a layer cloud formed by widespread gentle ascent or advective cooling.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '060',
    name: 'Navigation',
    short: 'NAV',
    sortOrder: 6,
    topics: [
      {
        code: '060-01',
        name: 'General navigation',
        subtopics: [
          {
            code: '060-01-01',
            name: 'The earth',
            questions: [
              {
                num: 'NAV-001',
                text: 'One degree of latitude equals approximately:',
                a: '1 nm',
                b: '10 nm',
                c: '60 nm',
                d: '100 nm',
                correct: 'c',
                explanation:
                  'One degree of latitude = 60 nautical miles. One minute of latitude = 1 nm.',
              },
              {
                num: 'NAV-002',
                text: 'Lines of longitude converge at the:',
                a: 'Equator',
                b: 'Tropics',
                c: 'Poles',
                d: 'Prime meridian',
                correct: 'c',
                explanation:
                  'Meridians (lines of longitude) converge at the North and South Poles.',
              },
              {
                num: 'NAV-003',
                text: 'A great circle is:',
                a: 'Any circle on the earth',
                b: 'The shortest distance between two points on a sphere',
                c: 'Always a line of latitude',
                d: 'Only the equator',
                correct: 'b',
                explanation:
                  'A great circle is a circle whose plane passes through the centre of the earth — the shortest surface route.',
              },
            ],
          },
          {
            code: '060-01-02',
            name: 'Magnetism and compasses',
            questions: [
              {
                num: 'NAV-004',
                text: 'Variation is the difference between:',
                a: 'Compass and magnetic north',
                b: 'True and magnetic north',
                c: 'True and compass north',
                d: 'Grid and true north',
                correct: 'b',
                explanation:
                  'Variation is the angular difference between true north and magnetic north at a given location.',
              },
              {
                num: 'NAV-005',
                text: 'Deviation is caused by:',
                a: "The earth's magnetic field",
                b: 'Metallic/electrical components in the aircraft',
                c: 'Solar activity',
                d: 'Latitude',
                correct: 'b',
                explanation:
                  "Compass deviation is caused by magnetic fields from the aircraft's own metallic components and electrical systems.",
              },
              {
                num: 'NAV-006',
                text: 'Isogonals are lines of equal:',
                a: 'Deviation',
                b: 'Variation',
                c: 'Altitude',
                d: 'Pressure',
                correct: 'b',
                explanation:
                  'Isogonals (isogonic lines) connect points of equal magnetic variation.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '070',
    name: 'Operational Procedures',
    short: 'OPS',
    sortOrder: 7,
    topics: [
      {
        code: '070-01',
        name: 'General operations',
        subtopics: [
          {
            code: '070-01-01',
            name: 'Fuel planning',
            questions: [
              {
                num: 'OPS-001',
                text: 'The minimum VFR fuel reserve for a PPL flight is:',
                a: '30 minutes',
                b: '45 minutes',
                c: 'Varies by regulation',
                d: '60 minutes',
                correct: 'c',
                explanation:
                  'The minimum VFR fuel reserve varies by national authority — commonly 30 or 45 minutes at cruise consumption.',
              },
              {
                num: 'OPS-002',
                text: 'AVGAS 100LL is coloured:',
                a: 'Red',
                b: 'Green',
                c: 'Blue',
                d: 'Clear',
                correct: 'c',
                explanation: 'AVGAS 100LL (low lead) is dyed blue for identification.',
              },
              {
                num: 'OPS-003',
                text: 'Fuel should be checked for contamination by:',
                a: 'Visual inspection of gauges',
                b: 'Draining a sample from sumps',
                c: 'Smelling the filler cap',
                d: 'Checking the fuel receipt',
                correct: 'b',
                explanation:
                  'Water and sediment are detected by draining fuel samples from sump drains during preflight.',
              },
            ],
          },
        ],
      },
      {
        code: '070-02',
        name: 'Emergency procedures',
        subtopics: [
          {
            code: '070-02-01',
            name: 'Distress and urgency',
            questions: [
              {
                num: 'OPS-004',
                text: 'The transponder code for emergency is:',
                a: '7500',
                b: '7600',
                c: '7700',
                d: '7000',
                correct: 'c',
                explanation:
                  'Squawk 7700 for emergency, 7600 for communications failure, 7500 for hijack.',
              },
              {
                num: 'OPS-005',
                text: 'A MAYDAY call indicates:',
                a: 'Urgency',
                b: 'Distress — grave and imminent danger',
                c: 'Radio failure',
                d: 'Medical emergency only',
                correct: 'b',
                explanation:
                  'MAYDAY is the distress call indicating grave and imminent danger to the aircraft or persons on board.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '080',
    name: 'Principles of Flight',
    short: 'POF',
    sortOrder: 8,
    topics: [
      {
        code: '080-01',
        name: 'Aerodynamics',
        subtopics: [
          {
            code: '080-01-01',
            name: 'Lift and drag',
            questions: [
              {
                num: 'POF-001',
                text: 'Lift is generated primarily by:',
                a: 'The engine thrust',
                b: 'A pressure difference between upper and lower wing surfaces',
                c: 'The weight of the aircraft',
                d: 'The angle of the propeller',
                correct: 'b',
                explanation:
                  'Lift results from lower pressure on the upper surface and higher pressure on the lower surface of the wing.',
              },
              {
                num: 'POF-002',
                text: 'Induced drag:',
                a: 'Increases with speed',
                b: 'Decreases with speed',
                c: 'Is constant at all speeds',
                d: 'Only occurs in a climb',
                correct: 'b',
                explanation:
                  'Induced drag is inversely proportional to V² — it decreases as speed increases.',
              },
              {
                num: 'POF-003',
                text: 'The stall occurs when:',
                a: 'The engine fails',
                b: 'The critical angle of attack is exceeded',
                c: 'Speed drops below a fixed value',
                d: 'The aircraft is too heavy',
                correct: 'b',
                explanation:
                  'A stall occurs when the critical (maximum) angle of attack is exceeded, causing flow separation and loss of lift.',
              },
              {
                num: 'POF-004',
                text: 'Parasite drag:',
                a: 'Decreases with speed',
                b: 'Increases proportionally with speed squared',
                c: 'Is constant',
                d: 'Only affects biplanes',
                correct: 'b',
                explanation:
                  'Parasite (zero-lift) drag is proportional to V² — it increases with the square of airspeed.',
              },
            ],
          },
          {
            code: '080-01-02',
            name: 'Stability',
            questions: [
              {
                num: 'POF-005',
                text: 'An aircraft with positive static stability will:',
                a: 'Continue to diverge after a disturbance',
                b: 'Return towards its original state after a disturbance',
                c: 'Remain in the new attitude',
                d: 'Oscillate with increasing amplitude',
                correct: 'b',
                explanation:
                  'Positive static stability means the initial tendency after a disturbance is to return towards the original equilibrium.',
              },
              {
                num: 'POF-006',
                text: 'The horizontal stabiliser provides:',
                a: 'Lateral stability',
                b: 'Directional stability',
                c: 'Longitudinal stability',
                d: 'Dutch roll damping',
                correct: 'c',
                explanation:
                  'The horizontal stabiliser (tailplane) provides longitudinal (pitch) stability.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '090',
    name: 'Communications',
    short: 'COM',
    sortOrder: 9,
    topics: [
      {
        code: '090-01',
        name: 'VFR communications',
        subtopics: [
          {
            code: '090-01-01',
            name: 'Radiotelephony phraseology',
            questions: [
              {
                num: 'COM-001',
                text: '"Roger" means:',
                a: 'I agree',
                b: 'I have received your message',
                c: 'Affirmative',
                d: 'Say again',
                correct: 'b',
                explanation:
                  '"Roger" means "I have received all of your last transmission." It does not mean agreement.',
              },
              {
                num: 'COM-002',
                text: '"Wilco" means:',
                a: 'Roger',
                b: 'I will comply with your instruction',
                c: 'Negative',
                d: 'Stand by',
                correct: 'b',
                explanation:
                  '"Wilco" means "I have received your message, understand it, and will comply."',
              },
              {
                num: 'COM-003',
                text: 'The altimeter setting given by ATC as QNH provides altitude above:',
                a: 'The aerodrome',
                b: 'Mean sea level',
                c: 'The standard datum (1013.25 hPa)',
                d: 'Ground level',
                correct: 'b',
                explanation:
                  'QNH is the altimeter setting that gives altitude above mean sea level.',
              },
              {
                num: 'COM-004',
                text: 'The correct way to say "FL350" is:',
                a: 'Flight level three hundred fifty',
                b: 'Flight level three five zero',
                c: 'Flight level thirty-five thousand',
                d: 'Level 350',
                correct: 'b',
                explanation: 'Each digit is spoken individually: "Flight level three five zero."',
              },
            ],
          },
        ],
      },
    ],
  },
]

async function seed() {
  // Get admin user and org
  const { data: admin, error: adminErr } = await db
    .from('users')
    .select('id, organization_id')
    .eq('role', 'admin')
    .single()
  if (adminErr || !admin) throw new Error(`No admin user found: ${adminErr?.message}`)

  // Get or create question bank
  const { data: bank, error: bankErr2 } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', admin.organization_id)
    .is('deleted_at', null)
    .single()
  if (bankErr2) throw new Error(`Question bank lookup failed: ${bankErr2.message}`)
  if (!bank) throw new Error('No question bank found — run seed-admin-eval.ts first')

  let totalInserted = 0

  for (const subj of SUBJECTS) {
    // Upsert subject
    const { data: subject, error: subjErr } = await db
      .from('easa_subjects')
      .upsert(
        { code: subj.code, name: subj.name, short: subj.short, sort_order: subj.sortOrder },
        { onConflict: 'code' },
      )
      .select('id')
      .single()
    if (subjErr) throw new Error(`Subject ${subj.code}: ${subjErr.message}`)

    for (const t of subj.topics) {
      // Upsert topic
      const { data: existingTopic, error: topicErr } = await db
        .from('easa_topics')
        .select('id')
        .eq('subject_id', subject.id)
        .eq('code', t.code)
        .maybeSingle()
      if (topicErr) throw new Error(`Topic lookup failed: ${topicErr.message}`)

      let topicId: string
      if (existingTopic) {
        topicId = existingTopic.id
      } else {
        const { data: newTopic, error: tErr } = await db
          .from('easa_topics')
          .insert({ subject_id: subject.id, code: t.code, name: t.name, sort_order: 1 })
          .select('id')
          .single()
        if (tErr) throw new Error(`Topic ${t.code}: ${tErr.message}`)
        topicId = newTopic.id
      }

      for (const st of t.subtopics) {
        // Upsert subtopic
        const { data: existingSub, error: subErr } = await db
          .from('easa_subtopics')
          .select('id')
          .eq('topic_id', topicId)
          .eq('code', st.code)
          .maybeSingle()
        if (subErr) throw new Error(`Subtopic lookup failed: ${subErr.message}`)

        let subtopicId: string
        if (existingSub) {
          subtopicId = existingSub.id
        } else {
          const { data: newSub, error: stErr } = await db
            .from('easa_subtopics')
            .insert({ topic_id: topicId, code: st.code, name: st.name, sort_order: 1 })
            .select('id')
            .single()
          if (stErr) throw new Error(`Subtopic ${st.code}: ${stErr.message}`)
          subtopicId = newSub.id
        }

        // Insert questions
        for (const q of st.questions) {
          const { data: existing } = await db
            .from('questions')
            .select('id')
            .eq('bank_id', bank.id)
            .eq('question_number', q.num)
            .is('deleted_at', null)
            .limit(1)
          if (existing && existing.length > 0) continue

          const { error: qErr } = await db.from('questions').insert({
            organization_id: admin.organization_id,
            bank_id: bank.id,
            question_number: q.num,
            subject_id: subject.id,
            topic_id: topicId,
            subtopic_id: subtopicId,
            question_text: q.text,
            options: [
              { id: 'a', text: q.a, correct: q.correct === 'a' },
              { id: 'b', text: q.b, correct: q.correct === 'b' },
              { id: 'c', text: q.c, correct: q.correct === 'c' },
              { id: 'd', text: q.d, correct: q.correct === 'd' },
            ],
            explanation_text: q.explanation,
            difficulty: 'medium',
            status: 'active',
            created_by: admin.id,
          })
          if (qErr) throw new Error(`Question ${q.num}: ${qErr.message}`)
          totalInserted++
        }
      }
    }
    console.log(`  ✓ ${subj.short} (${subj.code}) — ${subj.name}`)
  }

  // Final count
  const { count } = await db
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)

  console.log(`\n--- DONE ---`)
  console.log(`Inserted: ${totalInserted} new questions`)
  console.log(`Total questions in DB: ${count}`)
  console.log(`Subjects: ${SUBJECTS.length} (ALW, AGK, FPP, HPL, MET, NAV, OPS, POF, COM)`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

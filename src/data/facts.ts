export interface LearningFact {
  id: number;
  topic: string;
  text: string;
}

// 120 Rich Bundled Offline Facts across Science, Space, Biology, History, Culinary Science, Tech, Nature, Math & Art
export const OFFLINE_LEARNING_FACTS: LearningFact[] = [
  { id: 1, topic: 'Technology', text: 'GPS satellites adjust their onboard clocks for relativity. Without correction, positioning errors would grow by kilometers each day.' },
  { id: 2, topic: 'Space', text: 'A teaspoon of neutron-star matter would weigh billions of tons on Earth, if it could exist here in that form.' },
  { id: 3, topic: 'Engineering', text: 'QR codes use Reed-Solomon error correction, so many can still be scanned even when up to 30% of the code is obscured.' },
  { id: 4, topic: 'Space', text: 'A day on Venus (one rotation relative to distant stars) is longer than its year around the Sun.' },
  { id: 5, topic: 'Biology', text: 'Octopuses have neurons throughout their arms, allowing complicated movements without routing every instruction through the brain.' },
  { id: 6, topic: 'Technology', text: 'The first computer mouse prototype was wooden and used two perpendicular wheels to track movement.' },
  { id: 7, topic: 'Physics', text: 'Optical atomic clocks are so precise that researchers can measure the change in time caused by lifting a clock just one centimeter.' },
  { id: 8, topic: 'Technology', text: 'Fiber-optic cables transmit information as pulses of light, and a single hair-thin glass strand can carry terabits per second.' },
  { id: 9, topic: 'Neuroscience', text: 'Your brain uses about one-fifth of your resting body energy, despite making up only around 2% of your body mass.' },
  { id: 10, topic: 'Earth & Ocean', text: "A lightning bolt can briefly heat the surrounding air to temperatures five times hotter than the Sun's surface." },
  { id: 11, topic: 'Physics', text: 'Graphene is a one-atom-thick sheet of carbon atoms arranged in a honeycomb pattern that is hundreds of times stronger than steel by weight.' },
  { id: 12, topic: 'Space', text: 'Light from the Sun takes roughly eight minutes and twenty seconds to reach Earth.' },
  { id: 13, topic: 'Technology', text: 'Modern neural networks learn patterns by adjusting millions or billions of numerical weights during training rather than following hand-coded rules.' },
  { id: 14, topic: 'Biology', text: 'Tardigrades can survive vacuum, radiation, and extreme freezing by entering a nearly dormant, dehydrated state called cryptobiosis.' },
  { id: 15, topic: 'Technology', text: 'Error-correcting codes help storage drives, Wi-Fi routers, and deep-space probes recover intact data from noisy signals.' },
  { id: 16, topic: 'Engineering', text: 'Soft robots use flexible elastomers and pneumatic chambers instead of rigid metal joints to safely grip delicate objects like fruit.' },
  { id: 17, topic: 'Space', text: 'Astronauts aboard the International Space Station witness about sixteen sunrises and sunsets every 24 hours.' },
  { id: 18, topic: 'Biology', text: 'MRI scanners use powerful magnetic fields and radio waves to image soft tissues without ionizing X-ray radiation.' },
  { id: 19, topic: 'Engineering', text: 'Heat pumps can deliver 3 to 4 times more heat energy indoors than the electrical energy they use because they move heat rather than generate it.' },
  { id: 20, topic: 'Earth & Ocean', text: 'The deepest trench of the ocean experiences water pressure over a thousand times greater than atmospheric pressure at sea level.' },
  { id: 21, topic: 'Physics', text: 'Quantum computers use qubits whose states can exist in superposition and entanglement to solve specific math problems faster.' },
  { id: 22, topic: 'Space', text: 'Astronomers determine what distant stars and exoplanet atmospheres are made of by studying the absorption lines in their light spectra.' },
  { id: 23, topic: 'Biology', text: 'Underground mycorrhizal fungi form symbiotic webs with plant roots, trading minerals and water for plant-produced sugars.' },
  { id: 24, topic: 'Technology', text: 'Over 95% of intercontinental internet traffic travels through undersea fiber-optic cables on the ocean floor, not satellites.' },
  { id: 25, topic: 'Physics', text: 'Earth’s magnetic field deflects charged particles from the solar wind, creating auroras when those particles collide with upper-atmosphere gases.' },
  { id: 26, topic: 'Technology', text: 'Modern smartphone cameras rapidly capture and blend multiple exposures behind the scenes to preserve shadow and highlight detail.' },
  { id: 27, topic: 'Space', text: 'Laser reflectors left on the Moon show it is slowly drifting away from Earth by roughly 3.8 centimeters per year.' },
  { id: 28, topic: 'Biology', text: 'Mitochondria contain their own circular DNA—a major clue that they evolved from once-free-living ancient bacteria.' },
  { id: 29, topic: 'History', text: "Engineers used the word 'bug' for technical glitches decades before Grace Hopper's team taped a real moth into a 1947 computer logbook." },
  { id: 30, topic: 'Engineering', text: 'Solar photovoltaic cells convert sunlight directly into electricity using semiconductor junctions with zero moving parts.' },
  { id: 31, topic: 'Space', text: 'Over 99.8% of the entire mass of our solar system is contained inside the Sun alone.' },
  { id: 32, topic: 'Neuroscience', text: 'Human retinas use rod cells for sensitive low-light vision and cone cells for sharp color discrimination in daylight.' },
  { id: 33, topic: 'Engineering', text: 'Active noise-cancelling headphones listen to ambient noise and emit inverted sound waves so the peaks and troughs cancel out.' },
  { id: 34, topic: 'Earth & Ocean', text: 'Ancient air bubbles trapped inside Antarctic ice cores preserve direct samples of Earth’s atmosphere from hundreds of thousands of years ago.' },
  { id: 35, topic: 'Technology', text: 'Lithium-ion batteries recharge by shuttling lithium ions back and forth between layered anode and cathode materials.' },
  { id: 36, topic: 'Space', text: 'The James Webb Space Telescope observes in infrared light so it can peer straight through dense cosmic dust clouds.' },
  { id: 37, topic: 'Biology', text: 'When grazed by insects, acacia and willow trees release airborne volatile compounds that prompt neighboring trees to boost defensive tannins.' },
  { id: 38, topic: 'Math & Logic', text: 'A Möbius strip has only one continuous surface and one single edge—trace it with a pen and you cover both sides without lifting.' },
  { id: 39, topic: 'Technology', text: 'Local-first software keeps your data right on your device first, making every click instant even in airplane mode.' },
  { id: 40, topic: 'Physics', text: 'In a vacuum with no air drag, a hammer and a feather dropped together hit the ground at the exact same instant—demonstrated on Apollo 15.' },
  { id: 41, topic: 'Food Science', text: 'Browning bread, seared steaks, and roasted coffee all get their deep flavor from the Maillard reaction between amino acids and sugars above 285°F (140°C).' },
  { id: 42, topic: 'Food Science', text: 'Adding a pinch of salt to coffee or grapefruit suppresses bitterness receptors on the tongue, making subtle sweetness pop.' },
  { id: 43, topic: 'Food Science', text: 'Honey never truly spoils when sealed because its low moisture, natural acidity, and trace hydrogen peroxide prevent bacteria from thriving.' },
  { id: 44, topic: 'Food Science', text: 'Resting cooked meat for 5–10 minutes lets muscle fibers relax slightly so juices redistribute instead of spilling out on the cutting board.' },
  { id: 45, topic: 'Food Science', text: 'Starchy pasta cooking water acts as an emulsifier, binding oil and cheese into a silky sauce that clings to noodles.' },
  { id: 46, topic: 'Food Science', text: 'Chopping or crushing garlic and letting it rest for 10 minutes before heating allows the enzyme alliinase to create flavorful allicin.' },
  { id: 47, topic: 'Food Science', text: 'Baking soda needs an acidic partner like buttermilk, yogurt, or brown sugar to fizz, whereas baking powder already carries its own dry acid.' },
  { id: 48, topic: 'Food Science', text: 'Apples, bananas, and avocados emit ethylene gas as they ripen—putting an unripe avocado in a paper bag with a banana speeds ripening.' },
  { id: 49, topic: 'Food Science', text: 'Popcorn pops because each kernel traps a tiny droplet of water inside a hard hull that flashes to steam around 356°F (180°C).' },
  { id: 50, topic: 'Food Science', text: 'Toasting whole spices dry in a skillet for 30–60 seconds unlocks fat-soluble aromatic oils that stay muted when raw.' },
  { id: 51, topic: 'History', text: 'Oxford University began teaching over 300 years before the Aztec Empire founded Tenochtitlan in 1325.' },
  { id: 52, topic: 'History', text: 'Cleopatra lived closer in time to the 1969 Moon landing than to the construction of the Great Pyramid of Giza.' },
  { id: 53, topic: 'History', text: 'Ancient Roman concrete grows stronger over centuries in seawater because volcanic ash reacts with saltwater to form interlocking mineral crystals.' },
  { id: 54, topic: 'History', text: 'The oldest known written customer complaint is a 3,750-year-old clay tablet from Ur complaining about low-grade copper ingots.' },
  { id: 55, topic: 'History', text: 'Printing with movable clay and metal type was invented in East Asia centuries before Gutenberg’s mechanical press in 1440s Europe.' },
  { id: 56, topic: 'History', text: 'The shortest recorded war in history—the Anglo-Zanzibar War of 1896—lasted roughly 38 to 45 minutes.' },
  { id: 57, topic: 'History', text: 'Viking navigators may have used calcite crystals called sunstones to polarize skylight and locate the Sun even under thick clouds.' },
  { id: 58, topic: 'History', text: 'The Library of Alexandria aimed to collect a copy of every scroll in the known Mediterranean world, even copying books from visiting ships.' },
  { id: 59, topic: 'History', text: 'Polynesian wayfinders crossed thousands of miles of open Pacific Ocean without compasses by reading star paths, ocean swells, and seabirds.' },
  { id: 60, topic: 'History', text: 'Standardized time zones were popularized in the late 1800s largely so railway schedules across different cities stopped colliding.' },
  { id: 61, topic: 'Biology', text: 'Sea otters hold hands while floating on their backs asleep so ocean currents do not drift them apart.' },
  { id: 62, topic: 'Biology', text: 'Crows and ravens recognize individual human faces and can even pass warnings about unfriendly people down to younger birds.' },
  { id: 63, topic: 'Biology', text: 'Bananas share roughly 50–60% of basic cellular housekeeping genes with humans because all complex life shares ancient biochemical machinery.' },
  { id: 64, topic: 'Biology', text: 'Hummingbirds are the only birds capable of sustained backward flight thanks to figure-eight wing strokes powered by rotating shoulder joints.' },
  { id: 65, topic: 'Biology', text: 'Blue whales are the largest animals ever known to have lived on Earth—larger even than the biggest sauropod dinosaurs.' },
  { id: 66, topic: 'Biology', text: 'Honeybees communicate the direction and distance of flower patches relative to the Sun through a figure-eight "waggle dance."' },
  { id: 67, topic: 'Biology', text: 'Sharks have existed in Earth’s oceans for over 400 million years—predating both trees and the rings of Saturn.' },
  { id: 68, topic: 'Biology', text: 'Axolotls can regenerate entire limbs, sections of their spinal cord, and even parts of their heart without leaving scar tissue.' },
  { id: 69, topic: 'Biology', text: 'A single teaspoon of healthy forest soil can contain billions of bacteria and miles of microscopic fungal threads.' },
  { id: 70, topic: 'Biology', text: 'Dolphins give themselves unique signature whistles that function much like personal names within their pods.' },
  { id: 71, topic: 'Neuroscience', text: 'Writing notes by hand engages more motor and spatial-memory networks than verbatim typing, often boosting conceptual recall.' },
  { id: 72, topic: 'Neuroscience', text: 'During deep sleep, the brain’s glymphatic system widens fluid channels between cells to flush out daily metabolic waste proteins.' },
  { id: 73, topic: 'Neuroscience', text: 'Spaced repetition works because recalling a memory right as it starts to fade triggers stronger synaptic reinforcement than cramming.' },
  { id: 74, topic: 'Neuroscience', text: 'Smell is the only human sense routed directly to the amygdala and hippocampus before passing through the thalamus—explaining vivid scent memories.' },
  { id: 75, topic: 'Neuroscience', text: 'Short 10-to-20-minute walks in natural daylight measurably sharpen working memory and help anchor your evening circadian melatonin rhythm.' },
  { id: 76, topic: 'Neuroscience', text: 'The Zeigarnik effect describes why unfinished tasks loop in your head—writing them down into a trusted list immediately quiets that mental noise.' },
  { id: 77, topic: 'Neuroscience', text: 'Your heart beats roughly 100,000 times a day, pumping about 2,000 gallons of blood through 60,000 miles of blood vessels.' },
  { id: 78, topic: 'Neuroscience', text: 'Learning a musical instrument thickens the corpus callosum—the fiber bridge connecting the left and right hemispheres of the brain.' },
  { id: 79, topic: 'Space', text: 'Saturn’s average density is lower than liquid water—though it is mostly swirling hydrogen and helium, not a solid ball.' },
  { id: 80, topic: 'Space', text: 'Olympus Mons on Mars is a shield volcano nearly three times the height of Mount Everest and wide enough to cover Arizona.' },
  { id: 81, topic: 'Space', text: 'Voyager 1, launched in 1977, is over 15 billion miles away and still sends back scientific data from interstellar space.' },
  { id: 82, topic: 'Space', text: 'Neutron stars called pulsars can spin hundreds of times per second, sweeping beams of radio waves across space like cosmic lighthouses.' },
  { id: 83, topic: 'Space', text: 'On Titan, Saturn’s largest moon, liquid methane and ethane fall as rain, carve rivers, and fill vast lakes beneath a hazy orange sky.' },
  { id: 84, topic: 'Space', text: 'Every atom of calcium in your bones and iron in your blood was forged inside ancient stars and scattered by supernova explosions.' },
  { id: 85, topic: 'Space', text: 'Jupiter’s Great Red Spot is a high-pressure storm larger than Earth that astronomers have tracked for over 300 years.' },
  { id: 86, topic: 'Earth & Ocean', text: 'More than half of Earth’s oxygen is produced not by rainforests, but by microscopic photosynthetic phytoplankton drifting in the oceans.' },
  { id: 87, topic: 'Earth & Ocean', text: 'The earthy scent right after rain falls on dry soil is called petrichor—caused mainly by a molecule called geosmin released by soil microbes.' },
  { id: 88, topic: 'Earth & Ocean', text: 'A typical puffy cumulus cloud weighs around 500 tons—about the same as 100 elephants—staying aloft because its droplets are tiny and spread out.' },
  { id: 89, topic: 'Earth & Ocean', text: 'Earth’s tectonic plates drift at roughly the same speed that human fingernails grow—a few centimeters every year.' },
  { id: 90, topic: 'Earth & Ocean', text: 'Lake Baikal in Siberia holds roughly 20% of all unfrozen surface freshwater on Earth—more than all five North American Great Lakes combined.' },
  { id: 91, topic: 'Earth & Ocean', text: 'Hot water freezes faster than cold water under certain lab conditions, a quirky thermodynamic puzzle known as the Mpemba effect.' },
  { id: 92, topic: 'Earth & Ocean', text: 'Over 80% of the ocean floor remains unmapped at high resolution—we currently have more detailed maps of Mars than of Earth’s abyssal plains.' },
  { id: 93, topic: 'Math & Logic', text: 'In a room of just 23 people, there is better than a 50% probability that two people share the exact same birthday.' },
  { id: 94, topic: 'Math & Logic', text: 'If you fold a standard sheet of paper in half 42 times (ignoring physical limits), its thickness would reach from Earth to the Moon.' },
  { id: 95, topic: 'Math & Logic', text: 'The Fibonacci sequence (1, 1, 2, 3, 5, 8, 13...) naturally appears in sunflower seed spirals and pinecones because it packs seeds most efficiently.' },
  { id: 96, topic: 'Math & Logic', text: 'A standard deck of 52 playing cards has 52! (8×10⁶⁷) arrangements—every thorough shuffle almost certainly produces an order never seen in history.' },
  { id: 97, topic: 'Math & Logic', text: 'Zero was developed as an explicit number with arithmetic rules in India around the 5th–7th centuries, revolutionizing mathematics.' },
  { id: 98, topic: 'Math & Logic', text: 'Hexagons tile a flat plane with the smallest total perimeter for a given area—the exact geometric reason honeybees build hexagonal combs.' },
  { id: 99, topic: 'Math & Logic', text: 'Euler’s identity e^(iπ) + 1 = 0 links five of mathematics’ most fundamental constants in a single compact equation.' },
  { id: 100, topic: 'Physics', text: 'Sound travels more than four times faster through water than through air—and nearly fifteen times faster through solid steel.' },
  { id: 101, topic: 'Physics', text: 'Glass is an amorphous solid, not a slow-flowing liquid; old cathedral windows are thicker at the bottom because medieval glassmakers mounted heavier edges down.' },
  { id: 102, topic: 'Physics', text: 'Superconductors cooled below their critical temperature carry electric current with literally zero electrical resistance and expel magnetic fields.' },
  { id: 103, topic: 'Physics', text: 'Rainbows are actually full circles; from the ground, the horizon cuts off the lower half, while pilots sometimes see complete circular rainbows.' },
  { id: 104, topic: 'Physics', text: 'Static shocks when touching a doorknob can reach several thousand volts, yet stay harmless because the electric current lasts only microseconds.' },
  { id: 105, topic: 'Engineering', text: 'Suspension bridges expand and contract noticeably with temperature—the Golden Gate Bridge center span rises and falls up to 16 feet between cold and hot days.' },
  { id: 106, topic: 'Engineering', text: 'Airplane windows are rounded instead of square because sharp corners concentrate cabin pressurization stress and cause metal fatigue cracks.' },
  { id: 107, topic: 'Engineering', text: 'Modern tall skyscrapers like Taipei 101 suspend giant multi-hundred-ton tuned mass dampers near the top to counteract wind sway.' },
  { id: 108, topic: 'Engineering', text: 'Velcro was inspired in 1941 when Swiss engineer George de Mestral examined burdock burrs stuck to his dog’s fur under a microscope.' },
  { id: 109, topic: 'Engineering', text: 'The tiny dimples on a golf ball create a thin turbulent boundary layer that reduces drag and lets the ball fly roughly twice as far.' },
  { id: 110, topic: 'Music & Art', text: 'Japanese Kintsugi repairs broken pottery with lacquer dusted in gold, celebrating the object’s history and resilience rather than hiding flaws.' },
  { id: 111, topic: 'Music & Art', text: 'The Stradivarius violin sound comes partly from dense spruce wood grown during Europe’s "Little Ice Age" when summers were unusually cool.' },
  { id: 112, topic: 'Music & Art', text: 'The color ultramarine was once worth more per ounce than gold because it had to be ground from lapis lazuli mined in Afghanistan.' },
  { id: 113, topic: 'Music & Art', text: 'Paper sizes in the ISO A-series (A4, A5, A6) use an aspect ratio of √2 so cutting any sheet cleanly in half preserves the exact same proportions.' },
  { id: 114, topic: 'Everyday Science', text: 'The little ridged edge (reeding) on coins was originally invented so people could immediately spot if someone had shaved precious metal off the rim.' },
  { id: 115, topic: 'Everyday Science', text: 'Yawning helps cool brain temperature slightly through deep inhalation of ambient air and increased blood flow around the skull.' },
  { id: 116, topic: 'Everyday Science', text: 'Bubble wrap was originally invented in 1957 as an attempt to create trendy textured 3D plastic wallpaper.' },
  { id: 117, topic: 'Everyday Science', text: 'Cast iron pans become naturally non-stick through polymerization—heating thin layers of oil past their smoke point bonds them into a smooth carbon matrix.' },
  { id: 118, topic: 'Everyday Science', text: 'Fresh snow absorbs sound waves across its porous air pockets, which is why the world sounds noticeably hushed right after a snowfall.' },
  { id: 119, topic: 'Everyday Science', text: 'Cats always seem to land upright thanks to a flexible spine and inner-ear righting reflex that rotates front and back halves independently.' },
  { id: 120, topic: 'Everyday Science', text: 'A single pencil contains enough graphite to draw a continuous line roughly 35 miles long or write around 45,000 words.' },
  { id: 121, topic: 'Math & Logic', text: 'A prime number greater than 3 is always one more or one less than a multiple of 6, although most numbers of that form are not prime.' },
  { id: 122, topic: 'Physics', text: 'A refrigerator moves heat from its cold interior to the warmer room, using electrical work to drive that heat transfer.' },
  { id: 123, topic: 'Technology', text: 'A checksum can detect many accidental changes to a file, while a cryptographic hash also makes finding another file with the same digest computationally difficult.' },
  { id: 124, topic: 'Engineering', text: 'An integral image stores cumulative pixel sums, allowing the sum over any rectangular image region to be computed with four array lookups.' },
  { id: 125, topic: 'Space', text: 'The phases of the Moon are caused by changing viewing geometry as it orbits Earth, not by Earth casting its shadow on the Moon.' },
  { id: 126, topic: 'Food Science', text: 'Water dissolves polar substances like table salt, while oils dissolve many nonpolar flavor compounds; this is why different cooking liquids extract different flavors.' },
  { id: 127, topic: 'Math & Logic', text: 'The median is resistant to extreme outliers: changing the largest value in a sorted sample may leave the median unchanged.' },
  { id: 128, topic: 'Technology', text: 'A database transaction can group several changes so that either all commit together or none take effect.' },
];

export function getFactTopics(customDeck?: LearningFact[]): string[] {
  const all = [...OFFLINE_LEARNING_FACTS, ...(customDeck ?? [])];
  return ['All', ...Array.from(new Set(all.map((f) => f.topic))).sort()];
}

export function getDailyFact(
  dateIso: string,
  offset = 0,
  customDeck?: LearningFact[],
  topicFilter = 'All'
): { fact: LearningFact; totalInDeck: number } {
  const combined = [...OFFLINE_LEARNING_FACTS, ...(customDeck ?? [])];
  const filtered =
    topicFilter && topicFilter !== 'All'
      ? combined.filter((f) => f.topic === topicFilter)
      : combined;
  const deck = filtered.length > 0 ? filtered : combined;

  let hash = 0;
  for (let i = 0; i < dateIso.length; i++) {
    hash = (hash * 31 + dateIso.charCodeAt(i)) >>> 0;
  }
  const safeOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  const index = (hash + safeOffset % deck.length) % deck.length;
  return {
    fact: deck[index < 0 ? index + deck.length : index],
    totalInDeck: deck.length,
  };
}

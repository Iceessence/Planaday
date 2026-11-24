export interface LearningFact {
  id: number;
  topic: string;
  text: string;
}

// Appendix B: All 40 Offline Science & Technology Learning Facts (bundled 100% offline)
export const OFFLINE_LEARNING_FACTS: LearningFact[] = [
  { id: 1, topic: 'Technology', text: 'GPS satellites adjust their onboard clocks for relativity. Without correction, positioning errors would grow by kilometers each day.' },
  { id: 2, topic: 'Science', text: 'A teaspoon of neutron-star matter would weigh billions of tons on Earth, if it could exist here in that form.' },
  { id: 3, topic: 'Engineering', text: 'QR codes use error correction, so many can still be read even when part of the code is obscured.' },
  { id: 4, topic: 'Space', text: 'A day on Venus (one rotation relative to distant stars) is longer than its year around the Sun.' },
  { id: 5, topic: 'Biology', text: 'Octopuses have neurons throughout their arms, allowing complicated movements without routing every instruction through the brain.' },
  { id: 6, topic: 'Computing', text: 'The first computer mouse prototype was wooden and used two wheels to track movement.' },
  { id: 7, topic: 'Physics', text: 'Some atomic clocks are so precise that researchers can measure the change in time caused by a height difference of centimeters.' },
  { id: 8, topic: 'Technology', text: 'Fiber-optic cables transmit information as pulses of light, and one strand can carry enormous amounts of data.' },
  { id: 9, topic: 'Neuroscience', text: 'Your brain uses about one-fifth of your resting body energy, despite being a small fraction of your body mass.' },
  { id: 10, topic: 'Earth science', text: "A lightning bolt can briefly heat the surrounding air to temperatures hotter than the Sun's surface." },
  { id: 11, topic: 'Materials', text: 'Graphene is a one-atom-thick sheet of carbon atoms arranged in a honeycomb pattern.' },
  { id: 12, topic: 'Space', text: 'Light from the Sun takes roughly eight minutes and twenty seconds to reach Earth.' },
  { id: 13, topic: 'AI', text: 'Modern neural networks learn patterns by adjusting numerical weights during training, not by writing human-readable rules.' },
  { id: 14, topic: 'Biology', text: 'Tardigrades can survive extreme conditions by entering a nearly dormant, dehydrated state.' },
  { id: 15, topic: 'Computing', text: 'Error-correcting codes help storage drives and spacecraft recover data from corrupted signals.' },
  { id: 16, topic: 'Robotics', text: 'Some robots use soft, flexible materials instead of rigid joints to grip delicate objects.' },
  { id: 17, topic: 'Physics', text: 'The International Space Station experiences about sixteen sunrises and sunsets each day.' },
  { id: 18, topic: 'Medicine', text: 'MRI scanners use magnetic fields and radio waves to image tissues without ionizing X-rays.' },
  { id: 19, topic: 'Engineering', text: 'Heat pumps can deliver more heat energy indoors than the electrical energy they consume by moving heat rather than generating it.' },
  { id: 20, topic: 'Ocean science', text: 'The deepest parts of the ocean are under pressures more than a thousand times atmospheric pressure at sea level.' },
  { id: 21, topic: 'Quantum science', text: 'Quantum computers use qubits, whose states can be manipulated using quantum superposition and entanglement.' },
  { id: 22, topic: 'Astronomy', text: 'Astronomers can infer the composition of distant stars by analyzing the patterns of light they absorb and emit.' },
  { id: 23, topic: 'Ecology', text: 'Fungi can form mycorrhizal partnerships with plant roots, helping plants absorb nutrients and water.' },
  { id: 24, topic: 'Internet', text: 'Much of the global internet travels through undersea fiber-optic cables, rather than satellites.' },
  { id: 25, topic: 'Physics', text: 'The magnetic field around Earth helps deflect many charged particles from the solar wind.' },
  { id: 26, topic: 'Technology', text: 'Modern smartphone cameras often combine multiple exposures to improve dynamic range and reduce noise.' },
  { id: 27, topic: 'Space', text: 'The Moon is moving away from Earth by roughly 3.8 centimeters per year on average.' },
  { id: 28, topic: 'Biology', text: 'Mitochondria have their own DNA, a clue to their evolutionary origin as once-free-living organisms.' },
  { id: 29, topic: 'Computing', text: "The word 'bug' for a technical malfunction predates computers, although a famous moth was found in a 1947 relay." },
  { id: 30, topic: 'Energy', text: 'Solar photovoltaic cells convert light directly into electrical energy using semiconductor materials.' },
  { id: 31, topic: 'Astronomy', text: 'Most of the matter in the solar system is concentrated in the Sun.' },
  { id: 32, topic: 'Biology', text: 'The human eye has different photoreceptor cells specialized for low-light vision and color vision.' },
  { id: 33, topic: 'Engineering', text: 'Noise-cancelling headphones use microphones and carefully timed sound waves to reduce some outside noise.' },
  { id: 34, topic: 'Science', text: 'Scientists use ice cores to study traces of the atmosphere and climate from thousands of years ago.' },
  { id: 35, topic: 'Technology', text: 'Lithium-ion batteries shuttle lithium ions between electrodes during charging and discharging.' },
  { id: 36, topic: 'Space', text: 'The James Webb Space Telescope observes many objects in infrared light, which can reveal cool dust-obscured regions.' },
  { id: 37, topic: 'Biology', text: 'Some trees communicate chemical distress signals through airborne compounds that neighboring plants can detect.' },
  { id: 38, topic: 'Math', text: 'A Mobius strip has only one continuous side and one continuous boundary edge.' },
  { id: 39, topic: 'Technology', text: 'A local-first application can store data on your device and work without an always-on internet connection.' },
  { id: 40, topic: 'Physics', text: 'In an ideal vacuum, a feather and a hammer fall at the same rate when gravity is the only force acting.' },
];

export function getDailyFact(dateIso: string, offset = 0, customDeck?: LearningFact[]): LearningFact {
  const deck = customDeck && customDeck.length > 0 ? customDeck : OFFLINE_LEARNING_FACTS;
  let hash = 0;
  for (let i = 0; i < dateIso.length; i++) {
    hash = (hash * 31 + dateIso.charCodeAt(i)) >>> 0;
  }
  const index = (hash + offset) % deck.length;
  return deck[index < 0 ? index + deck.length : index];
}

// Rich Categorized Prompt Libraries for Diary Reflection & Thought Inbox Brain Dumps

export interface CategorizedPrompt {
  category: string;
  text: string;
}

export const DIARY_PROMPTS: CategorizedPrompt[] = [
  // Morning Intention
  { category: 'Morning', text: 'What is the one thing that, if finished today, would make tonight feel genuinely satisfying?' },
  { category: 'Morning', text: 'How does your body and mind feel waking up today, and what pace will serve you best?' },
  { category: 'Morning', text: 'What small act of kindness could you offer yourself or someone else before noon?' },
  { category: 'Morning', text: 'If today had a calm, two-word theme or motto, what would it be?' },
  { category: 'Morning', text: 'What distraction or friction can you clear out of your way right now?' },
  { category: 'Morning', text: 'What are you quietly looking forward to today—even if it is as simple as a warm drink or a walk?' },
  { category: 'Morning', text: 'Where do you want to protect your energy and attention most today?' },

  // Evening Reflection
  { category: 'Evening', text: 'What gave you the most calm, steady energy today?' },
  { category: 'Evening', text: 'What small win or quiet effort deserves appreciation tonight?' },
  { category: 'Evening', text: 'What felt heavier than expected today, and what can safely wait until tomorrow?' },
  { category: 'Evening', text: 'If you could replay one 10-minute moment from today, which moment would you choose?' },
  { category: 'Evening', text: 'What surprised you today—big or small?' },
  { category: 'Evening', text: 'What did you handle better today than you might have a year ago?' },
  { category: 'Evening', text: 'What unfinished loop can you write down right now so your mind can rest tonight?' },

  // Gratitude
  { category: 'Gratitude', text: 'Who made your day a little warmer, easier, or funnier?' },
  { category: 'Gratitude', text: 'What everyday comfort in your home are you glad exists right now?' },
  { category: 'Gratitude', text: 'Name three tiny sensory details you enjoyed today (a sound, scent, light, or flavor).' },
  { category: 'Gratitude', text: 'What skill, tool, or past decision saved you time or stress this week?' },
  { category: 'Gratitude', text: 'What part of your current routine quietly supports your well-being?' },
  { category: 'Gratitude', text: 'Who is someone you have not thanked lately, and why do they matter to you?' },
  { category: 'Gratitude', text: 'What unexpected silver lining showed up in an otherwise ordinary day?' },

  // Self-Growth
  { category: 'Growth', text: 'What is one thing you learned, noticed, or changed your mind about today?' },
  { category: 'Growth', text: 'Where did you step slightly outside your comfort zone recently?' },
  { category: 'Growth', text: 'What habit is feeling effortless lately, and which one needs a gentler setup?' },
  { category: 'Growth', text: 'What advice would you give a close friend facing the exact challenge on your mind today?' },
  { category: 'Growth', text: 'What boundary felt healthy to hold—or would feel good to set next time?' },
  { category: 'Growth', text: 'If you could spend 20 uninterrupted minutes learning any skill this week, what would you pick?' },
  { category: 'Growth', text: 'What belief or expectation have you outgrown lately?' },

  // Calm & Stress Relief
  { category: 'Calm & Stress', text: 'What is taking up mental bandwidth right now that you cannot actually control today?' },
  { category: 'Calm & Stress', text: 'What helped your nervous system settle down the most this week?' },
  { category: 'Calm & Stress', text: 'Write down everything you are worried about, then star only the one item you can act on next.' },
  { category: 'Calm & Stress', text: 'What does "good enough" look like on a low-energy day?' },
  { category: 'Calm & Stress', text: 'What obligation could you simplify, delegate, or drop without real harm?' },
  { category: 'Calm & Stress', text: 'Where in your schedule could you add a 15-minute unhurried breathing buffer?' },
  { category: 'Calm & Stress', text: 'What signals tell you early that you need rest, water, food, or fresh air?' },

  // Relationships & Family
  { category: 'Relationships', text: 'What conversation left you feeling genuinely understood or energized lately?' },
  { category: 'Relationships', text: 'What fun ritual or outing would you love to plan with family or friends soon?' },
  { category: 'Relationships', text: 'Who have you been thinking about that would smile at a quick two-line text?' },
  { category: 'Relationships', text: 'What is a favorite recent memory with someone you care about?' },
  { category: 'Relationships', text: 'How can you be more fully present during shared meals or evening downtime?' },
  { category: 'Relationships', text: 'What quality do you admire most in the people closest to you?' },

  // Creativity & Joy
  { category: 'Creativity', text: 'What book, song, meal, photo, or idea sparked curiosity for you recently?' },
  { category: 'Creativity', text: 'If you had a completely open Saturday with zero chores, how would you spend it?' },
  { category: 'Creativity', text: 'What playful project or hobby have you wanted to tinker with just for fun—not perfection?' },
  { category: 'Creativity', text: 'What color, season, or place matches your mood today, and why?' },
  { category: 'Creativity', text: 'What question have you been mulling over lately that has no easy answer?' },
  { category: 'Creativity', text: 'Describe one ordinary scene you saw today as if it were the opening frame of a movie.' },

  // Weekly Review
  { category: 'Weekly Review', text: 'Looking back at the past 7 days, what were your top 3 highlights?' },
  { category: 'Weekly Review', text: 'What drained your time or energy most this week, and how can next week prevent it?' },
  { category: 'Weekly Review', text: 'Which task or chore kept getting postponed—and can you shrink its first step to 2 minutes?' },
  { category: 'Weekly Review', text: 'What did your sleep, meals, and movement look like this week without judgment?' },
  { category: 'Weekly Review', text: 'What is one experiment you want to try next week to make mornings or evenings smoother?' },
  { category: 'Weekly Review', text: 'What are you proud of finishing or sticking with this week?' },
];

export const THOUGHT_PROMPTS: CategorizedPrompt[] = [
  // Brain Sweep
  { category: 'Brain Sweep', text: 'List every tiny errand, call, email, or return floating in the back of your head right now:' },
  { category: 'Brain Sweep', text: 'What has been bugging you around the house for more than a week that takes under 15 minutes to fix?' },
  { category: 'Brain Sweep', text: 'Dump every upcoming appointment, birthday, bill, or renewal coming in the next 30 days:' },
  { category: 'Brain Sweep', text: 'What items are running low in the kitchen, bathroom, garage, or desk?' },
  { category: 'Brain Sweep', text: 'What open browser tabs, unread messages, or half-finished notes need a 1-sentence decision?' },
  { category: 'Brain Sweep', text: 'Who are you waiting on for a reply, delivery, or favor right now?' },
  { category: 'Brain Sweep', text: 'What "someday" task keeps tapping you on the shoulder? Write it out so you can schedule or drop it:' },

  // Ideas & Projects
  { category: 'Ideas & Projects', text: 'If you had a weekend to build, organize, or upgrade one thing in your life, what would it be?' },
  { category: 'Ideas & Projects', text: 'Jot down 3 rough ideas for a project without editing or judging any of them:' },
  { category: 'Ideas & Projects', text: 'What is the tiniest first prototype or 10-minute version of an idea you have been sitting on?' },
  { category: 'Ideas & Projects', text: 'What recurring annoyance could you automate, template, or simplify once and for all?' },
  { category: 'Ideas & Projects', text: 'List 5 topics, books, recipes, or skills you want to explore next:' },
  { category: 'Ideas & Projects', text: 'What gift ideas have popped into your head recently for family or friends?' },

  // Problem Solving
  { category: 'Problem Solving', text: 'State the sticky problem in one blunt sentence, then list 3 wildly different ways to approach it:' },
  { category: 'Problem Solving', text: 'What is the worst realistic outcome, the best outcome, and the most likely outcome?' },
  { category: 'Problem Solving', text: 'If this problem had to be easy, what would the ridiculously simple solution look like?' },
  { category: 'Problem Solving', text: 'What missing piece of information would immediately clarify your next move?' },
  { category: 'Problem Solving', text: 'Break the overwhelming thing into 4 tiny physical next actions:' },
  { category: 'Problem Solving', text: 'What tradeoff are you actually choosing between right now (time, money, energy, or quality)?' },

  // Home & Life
  { category: 'Home & Life', text: 'What meals sound genuinely delicious to cook or prep in the next few days?' },
  { category: 'Home & Life', text: 'Which room or closet would feel 10x better after a quick 15-minute reset?' },
  { category: 'Home & Life', text: 'What weekend outing, day trip, or seasonal activity should go on the family calendar?' },
  { category: 'Home & Life', text: 'What home maintenance, car care, or seasonal prep item is coming due soon?' },
  { category: 'Home & Life', text: 'Draft a quick packing or shopping checklist before you forget the little essentials:' },
  { category: 'Home & Life', text: 'What routine (morning, bedtime, laundry, meals) could use a small tweak right now?' },

  // Creative Sparks
  { category: 'Creative Sparks', text: 'Capture a quote, lyric, conversation snippet, or weird observation you do not want to lose:' },
  { category: 'Creative Sparks', text: 'Brainstorm a wish list of fun experiences, places to visit, or restaurants to try:' },
  { category: 'Creative Sparks', text: 'Write an unfiltered rant or love letter to a topic you care deeply about:' },
  { category: 'Creative Sparks', text: 'What two unrelated things you saw this week unexpectedly connect together?' },
  { category: 'Creative Sparks', text: 'Sketch a rough outline for a story, guide, recipe twist, or creative experiment:' },

  // Unwind & Clarify
  { category: 'Unwind & Clarify', text: 'Free-write for 2 minutes without lifting your fingers—just empty the static out of your head:' },
  { category: 'Unwind & Clarify', text: 'What am I pretending not to know right now?' },
  { category: 'Unwind & Clarify', text: 'What deserves a firm "no" or "not this month" so my "yes" has room to breathe?' },
  { category: 'Unwind & Clarify', text: 'What would make tomorrow morning 20% calmer before I even have coffee?' },
  { category: 'Unwind & Clarify', text: 'What is going surprisingly right right now that I keep glossing over?' },
];

export function getDiaryPromptCategories(customPrompts?: string[]): string[] {
  const cats = new Set<string>(DIARY_PROMPTS.map((p) => p.category));
  if (customPrompts && customPrompts.length > 0) cats.add('My Prompts');
  return ['All', ...Array.from(cats)];
}

export function getThoughtPromptCategories(customPrompts?: string[]): string[] {
  const cats = new Set<string>(THOUGHT_PROMPTS.map((p) => p.category));
  if (customPrompts && customPrompts.length > 0) cats.add('My Prompts');
  return ['All', ...Array.from(cats)];
}

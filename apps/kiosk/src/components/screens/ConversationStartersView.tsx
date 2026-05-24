import { useMemo, useState } from "react";

interface ConversationStartersViewProps {
  onBack: () => void;
}

type ConversationCategory = {
  id: string;
  title: string;
  signal: string;
  description: string;
  questions: string[];
};

const categories: ConversationCategory[] = [
  {
    id: "best-friends",
    title: "Best Friends",
    signal: "History / Chaos / Nostalgia",
    description: "For people with shared stories, old jokes, and too much context.",
    questions: [
      "What is one tiny memory from us that still feels weirdly cinematic?",
      "Which old version of us would be most surprised by this table right now?",
      "What harmless debate between us will probably never be settled?",
      "If we had to open a cafe together, what would go wrong first?",
      "What is one thing we have somehow made into a tradition?",
      "What is the funniest phase one of us went through?",
      "Which trip, night, or plan should have been filmed like a documentary?",
      "What is one thing we both used to care about way too much?",
      "If we had to swap lives for a week, who would handle it better?",
      "What is a shared story that still sounds fake when we explain it?",
    ],
  },
  {
    id: "new-friends",
    title: "New Friends / Just Met",
    signal: "Light / Curious / Easy",
    description: "Clean icebreakers with enough texture to become real conversation.",
    questions: [
      "What is a place you visited that changed your opinion of it completely?",
      "What is one hobby you respect even if you would never do it?",
      "What is a small thing that instantly makes a city feel good to you?",
      "What is your most reliable way to judge a restaurant?",
      "What is an opinion you have that is low-stakes but strongly held?",
      "What is something you recently tried for the first time?",
      "What kind of trip sounds best to you right now: quiet, packed, or spontaneous?",
      "What is a food you did not expect to like but now appreciate?",
      "What is one topic you can talk about longer than most people expect?",
      "What is a small luxury you think is underrated?",
    ],
  },
  {
    id: "business",
    title: "Business Meeting",
    signal: "Ideas / Work / Future",
    description: "Useful questions for founders, teams, clients, and professional tables.",
    questions: [
      "What industry feels ready for a simpler, better product?",
      "What is one work habit that quietly compounds over time?",
      "Which current trend do you think is more substance than hype?",
      "What is a business you would start if execution was guaranteed?",
      "What is one lesson from work that applies surprisingly well to life?",
      "What is a product you admire because it removes friction beautifully?",
      "What is one professional skill that will matter more five years from now?",
      "Which company has built the clearest customer experience recently?",
      "What is one meeting habit that should become standard everywhere?",
      "What is a market people underestimate because it looks boring?",
    ],
  },
  {
    id: "date-night",
    title: "Date Night",
    signal: "Playful / Warm / Personal",
    description: "Light connection without making the table feel like an interview.",
    questions: [
      "What is your ideal slow morning if nothing is scheduled?",
      "What is a city you would want to explore with someone over a long weekend?",
      "What small gesture makes you feel instantly cared for?",
      "What fictional dinner scene would you want to be part of?",
      "What is a simple plan that sounds perfect to you right now?",
      "What is a song, film, or place that feels romantic without trying too hard?",
      "What is one everyday thing that tells you a lot about someone?",
      "What kind of home-cooked meal feels most comforting to you?",
      "What is a future trip you would want to plan slowly and properly?",
      "What is one quality that makes conversation feel effortless?",
    ],
  },
  {
    id: "family",
    title: "Family",
    signal: "Stories / Traditions / Warmth",
    description: "Questions for memories, appreciation, and familiar table energy.",
    questions: [
      "What family meal do you remember most clearly?",
      "What is one family habit that outsiders would find funny?",
      "Which family story gets better every time it is retold?",
      "What is something you learned at home without realizing it?",
      "What tradition should this family protect more intentionally?",
      "Who in the family gives the most memorable advice?",
      "What is one recipe, place, or ritual that feels like home?",
      "What is a small family moment you appreciate more now than before?",
      "Which family member would be funniest on a cooking show?",
      "What is one thing this family does better than it gives itself credit for?",
    ],
  },
  {
    id: "parent-child",
    title: "Parent & Child",
    signal: "Advice / Dreams / Bonding",
    description: "Gentle questions for life advice, dreams, and everyday closeness.",
    questions: [
      "What is something you were nervous to try but ended up enjoying?",
      "What is one skill you would love to get better at this year?",
      "What is a small moment from today that made you smile?",
      "What is one piece of advice that actually feels useful?",
      "If we planned a perfect day together, what would have to be included?",
      "What is something you want to understand better about the world?",
      "What is one thing you are proud of from this week?",
      "What is a meal you would like us to learn how to make together?",
      "What is something adults should remember about being young?",
      "What is something kids understand better than adults sometimes?",
    ],
  },
  {
    id: "team-dinner",
    title: "Team Dinner",
    signal: "Work Fun / Ambition / Balance",
    description: "Social questions for teams without turning dinner into a workshop.",
    questions: [
      "What is a workplace habit that makes a team instantly better?",
      "What is the funniest low-stakes problem our team could solve?",
      "Which part of work deserves more celebration than it gets?",
      "What is a non-work skill that helps you at work anyway?",
      "If our team had a signature menu item, what would it be called?",
      "What is one project type that brings out the best in this team?",
      "What is a small office ritual that would actually improve the week?",
      "Which work trend should disappear quietly?",
      "What is a team win that deserves more credit?",
      "If our team had a motto for this quarter, what would it be?",
    ],
  },
  {
    id: "deep",
    title: "Deep Questions",
    signal: "Reflective / Calm / Future",
    description: "Thoughtful questions that stay grounded and comfortable for the table.",
    questions: [
      "What is something you want to make more room for this year?",
      "What has quietly changed your perspective recently?",
      "What is a future version of your life that feels peaceful?",
      "What is one fear that became smaller after you understood it better?",
      "What does a well-spent day usually include for you?",
      "What is a belief you hold more gently than you used to?",
      "What kind of success would still feel good even if nobody noticed?",
      "What is one thing you want to become more patient with?",
      "What is a question you think people should ask themselves more often?",
      "What is something simple that helps you feel like yourself again?",
    ],
  },
  {
    id: "fun-chaotic",
    title: "Fun / Chaotic",
    signal: "Debates / Choices / Energy",
    description: "Absurd but harmless questions for tables that want a little spark.",
    questions: [
      "Which food is massively overrated but somehow still popular?",
      "Would you rather have perfect coffee forever or perfect dessert forever?",
      "What is one thing you would ban from all menus for one year?",
      "Which restaurant behavior should be politely illegal?",
      "What meal would be funniest to eat with a completely serious face?",
      "Which sauce deserves more respect than it gets?",
      "What food opinion would make the table disagree with you immediately?",
      "Would you rather eat only starters or only desserts for a month?",
      "What is the most dramatic way to review a mediocre sandwich?",
      "Which everyday object would be funniest if it were suddenly luxury-priced?",
    ],
  },
];

export default function ConversationStartersView({ onBack }: ConversationStartersViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedId) ?? null,
    [selectedId],
  );

  const nextQuestion = () => {
    if (!selectedCategory) return;
    setQuestionIndex((current) => (current + 1) % selectedCategory.questions.length);
  };

  const previousQuestion = () => {
    if (!selectedCategory) return;
    setQuestionIndex((current) =>
      current === 0 ? selectedCategory.questions.length - 1 : current - 1,
    );
  };

  const selectCategory = (category: ConversationCategory) => {
    setSelectedId(category.id);
    setQuestionIndex(0);
  };

  return (
    <section className="view utility-feature-view conversation-layer-view">
      <div className="utility-feature-hero conversation-hero panel">
        <div>
          <p className="eyebrow">Table Mode</p>
          <h1>Conversation Starters</h1>
          <p className="hero-sub">A premium social layer for thoughtful, natural table energy.</p>
        </div>
        <button className="secondary-btn utility-back-btn" onClick={onBack}>
          Back
        </button>
      </div>

      {!selectedCategory ? (
        <div className="conversation-category-grid">
          {categories.map((category, index) => (
            <button
              className="conversation-category-card"
              key={category.id}
              onClick={() => selectCategory(category)}
            >
              <span className="conversation-category-index">{String(index + 1).padStart(2, "0")}</span>
              <strong>{category.title}</strong>
              <small>{category.signal}</small>
              <p>{category.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="conversation-session-panel panel">
          <div className="conversation-session-head">
            <button
              className="conversation-change-btn"
              onClick={() => {
                setSelectedId(null);
                setQuestionIndex(0);
              }}
            >
              Categories
            </button>
            <div>
              <p className="eyebrow">{selectedCategory.signal}</p>
              <h2>{selectedCategory.title}</h2>
            </div>
            <span className="conversation-counter">
              {String(questionIndex + 1).padStart(2, "0")} / {String(selectedCategory.questions.length).padStart(2, "0")}
            </span>
          </div>

          <button
            className="conversation-question-card"
            key={`${selectedCategory.id}-${questionIndex}`}
            onClick={nextQuestion}
            onPointerDown={(event) => setTouchStartX(event.clientX)}
            onPointerUp={(event) => {
              if (touchStartX === null) return;
              const delta = event.clientX - touchStartX;
              setTouchStartX(null);
              if (Math.abs(delta) < 42) return;
              if (delta < 0) nextQuestion();
              else previousQuestion();
            }}
          >
            <span>Question</span>
            <strong>{selectedCategory.questions[questionIndex]}</strong>
            <small>Tap or swipe for the next question</small>
          </button>

          <div className="conversation-controls">
            <button className="secondary-btn" onClick={previousQuestion}>
              Previous
            </button>
            <button className="primary-btn" onClick={nextQuestion}>
              Next Question
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

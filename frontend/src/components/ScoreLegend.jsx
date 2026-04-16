import { scoreClass } from "../utils/score";

const ROWS = [
  { range: "40%+", score: 1 },
  { range: "35%",  score: 2 },
  { range: "30%",  score: 3 },
  { range: "25%",  score: 4 },
  { range: "20%",  score: 5 },
  { range: "15%",  score: 6 },
  { range: "10%",  score: 7 },
  { range: "5%",   score: 8 },
  { range: "<5%",  score: 10 },
];

export default function ScoreLegend() {
  return (
    <div className="score-legend">
      <p className="legend-title">Referencia de score</p>
      <p className="legend-subtitle">% desvío vs PVP</p>
      <div className="legend-rows">
        {ROWS.map(({ range, score }) => (
          <div key={score} className="legend-row">
            <span className="legend-range">≤{range}</span>
            <div className="legend-bar-wrap">
              <div className="legend-bar" style={{ width: `${score * 10}%` }} />
            </div>
            <span className={`score-badge ${scoreClass(score)}`}>{score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ProgressBar = ({ value, max, description = '' }: { value: number; max: number; description?: string }) => {
  const percent = Math.floor((value * 100) / max);
  const showDescription = percent > 10 && percent < 100;
  return (
    <div className="w-full bg-base-200 rounded-lg">
      {max !== undefined && value !== undefined && max > 0 && (
        <div className="grid items-center gap-4" style={{gridTemplateColumns:'8fr 5em minmax(0, 1fr)'}}>
          <progress className="progress w-full accent-primary" value={percent} max="100" />
          <span>{percent}%</span>
          <span>{showDescription ? description : ''}</span>
        </div>
      )}
    </div>
  );
};

export default ProgressBar;

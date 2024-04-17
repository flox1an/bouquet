const ProgressBar = ({ value, max, description = '' }: { value: number; max: number; description?: string }) => {
  const percent = Math.floor((value * 100) / max);
  const showDescription = description.length > 0;
  return (
    <div className="w-full bg-base-200 rounded-lg">
      {max !== undefined && value !== undefined && max > 0 && (
        <div className="grid items-center gap-4" style={{ gridTemplateColumns: '8fr 4em 6em' }}>
          <progress className="progress w-full accent-primary" value={percent} max="100" />
          <span>{percent}%</span>
          <span className="whitespace-nowrap overflow-ellipsis">{showDescription ? description : ''}</span>
        </div>
      )}
    </div>
  );
};

export default ProgressBar;

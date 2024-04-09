const ProgressBar = ({ value, max, description = '' }: { value: number; max: number; description?: string }) => {
  //value=11;max=100;description="4,5 MB/s"
  const percent = Math.floor((value * 100) / max);
  const showDescription = percent > 10 && percent < 100;
  return (
    <div className="w-full bg-gray-200 rounded-lg dark:bg-zinc-900">
      {max !== undefined && value !== undefined && max > 0 && (
        <div
          className="bg-pink-600 text-sm font-medium text-pink-100 text-center p-1 leading-none rounded-lg text-nowrap"
          style={{ width: `${percent}%` }}
        >
          {percent}&nbsp;% {showDescription ? description : ''}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;

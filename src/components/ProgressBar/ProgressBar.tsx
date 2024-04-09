const ProgressBar = ({ value, max }: { value: number; max: number }) => {
  return (
    <div className="w-full bg-gray-200 rounded-lg dark:bg-zinc-900">
      {max !== undefined && value !== undefined && max > 0 && (
        <div
          className="bg-pink-600 text-sm font-medium text-pink-100 text-center p-1 leading-none rounded-lg"
          style={{ width: `${Math.floor((value * 100) / max)}%` }}
        >
          {Math.floor((value * 100) / max)}&nbsp;%
        </div>
      )}
    </div>
  );
};

export default ProgressBar;

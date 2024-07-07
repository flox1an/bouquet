import React, { useState, ChangeEvent, KeyboardEvent } from 'react';

interface TagInputProps {
  tags: string[];
  setTags: (tags: string[]) => void;
}

const TagInput: React.FC<TagInputProps> = ({ tags, setTags }) => {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim() !== '') {
      setTags([...tags, inputValue.trim()]);
      setInputValue('');
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="flex flex-col items-start">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        className="input input-primary w-full max-w-xs"
        placeholder="a tag (+ press enter to add)"
      />
      <div className="flex flex-wrap mt-4">
        {tags.map((tag, index) => (
          <div key={index} className="badge badge-primary m-1 flex items-center">
            {tag}
            <button
              onClick={() => handleTagRemove(tag)}
              className="ml-2 text-white rounded-full w-4 h-5 p-0 flex items-center justify-center"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TagInput;

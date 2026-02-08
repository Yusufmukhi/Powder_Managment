import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-4 bg-white shadow-sm 
        ${onClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
    >
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
};

export default StatCard;

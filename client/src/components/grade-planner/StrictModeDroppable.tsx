import { useEffect, useState } from "react";
import { Droppable, type DroppableProps } from "react-beautiful-dnd";

/**
 * Wrapper around react-beautiful-dnd's Droppable that works with React 18.
 * react-beautiful-dnd@13 does not support React 18's StrictMode/concurrent rendering.
 * This defers rendering until after the first useEffect, avoiding the "Unable to find draggable" crash.
 */
export function StrictModeDroppable({ children, ...props }: DroppableProps) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return <Droppable {...props}>{children}</Droppable>;
}

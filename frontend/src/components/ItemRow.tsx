import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from './SortableTable';

interface ItemRowProps {
    item: Item;
    onSelectionChange: (id: number, isSelected: boolean) => void;
}

export const ItemRow = React.forwardRef<HTMLLIElement, ItemRowProps>(({ item, onSelectionChange }, ref) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id.toString() });

    const dynamicStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        backgroundColor: isDragging ? '#f0f0f0' : 'white',
        opacity: isDragging ? 0.5 : 1,
    };

    const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onSelectionChange(item.id, event.target.checked);
    };

    return (
        <li 
            ref={ref ? (node) => { setNodeRef(node); if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; } : setNodeRef} 
            className="item-row"
            style={dynamicStyle}
            {...attributes} 
            {...listeners}
        >
            <input
                type="checkbox"
                checked={item.isSelected}
                onChange={handleCheckboxChange}
                className="item-row-checkbox"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
            />
            {item.value}
        </li>
    );
});

ItemRow.displayName = 'ItemRow'; 
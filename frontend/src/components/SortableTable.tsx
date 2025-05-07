import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ItemRow } from './ItemRow.tsx';

const API_URL = '/api';

export interface Item {
    id: number;
    value: string;
    isSelected: boolean;
}

const SortableTable: React.FC = () => {
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, 
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const dragDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastOrderRef = useRef<number[]>([]);

    const fetchItems = useCallback(async (page: number, search: string, options?: { preserveOrderAndSelection?: boolean, signal?: AbortSignal }) => {
        const { preserveOrderAndSelection = false, signal } = options || {};
        
        setIsLoading(true);
        try {
            const response = await axios.get(`${API_URL}/items`, {
                params: { page, limit: 20, search },
                signal,
            });
            const newItems: Item[] = response.data.items;

            setTotalPages(response.data.totalPages);

            if (preserveOrderAndSelection) {
                setItems(prevItems => {
                    const existingIds = new Set(prevItems.map(i => i.id));
                    const uniqueNewItems = newItems.filter(newItem => !existingIds.has(newItem.id));

                    return [...prevItems, ...uniqueNewItems];
                });
            } else {
                setItems(newItems);
            }

        } catch (error) {
            console.error('Error fetching items:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch and fetch on search term change
    useEffect(() => {
        const controller = new AbortController();

        const delayDebounceFn = setTimeout(() => {
            setCurrentPage(1);
            fetchItems(1, searchTerm, { signal: controller.signal });
        }, 500); // Debounce search

        return () => {
            clearTimeout(delayDebounceFn);
            controller.abort();
        };
    }, [searchTerm, fetchItems]);

    // Load initial state from server
    useEffect(() => {
        const controller = new AbortController();

        const loadInitialState = async () => {
            try {
                const stateResponse = await axios.get(`${API_URL}/items/state`, { signal: controller.signal });
                const { selectedItemIds: serverSelectedIds /*, itemOrder: serverItemOrder*/ } = stateResponse.data;
                
                setSelectedIds(new Set(serverSelectedIds || []));

                await fetchItems(1, '', { preserveOrderAndSelection: true, signal: controller.signal });

            } catch (error: unknown) {
                if (axios.isCancel(error)) {
                    console.log('Initial state load cancelled:', error.message);
                    return;

                } else if (error instanceof Error) {
                    console.error('Error loading initial state:', error.message);

                    // Fallback to normal fetch if state load fails and it wasnt a cancellation
                    await fetchItems(1, '', { signal: controller.signal }); 
                    return;
                }

                console.error('An unexpected error occurred during initial state load:', error);
            }
        };

        loadInitialState();

        return () => {
            controller.abort();
        };
    }, [fetchItems]);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) { 
            setItems((currentItems) => {
                const oldIndex = currentItems.findIndex(item => item.id.toString() === active.id);
                const newIndex = currentItems.findIndex(item => item.id.toString() === over.id);

                if (oldIndex === -1 || newIndex === -1) {
                    console.warn("Draggable item not found for ID:", active.id, "or", over.id);
                    return currentItems; 
                }

                const newOrderedItems = arrayMove(currentItems, oldIndex, newIndex);
                const newOrderIds = newOrderedItems.map(item => item.id);
                lastOrderRef.current = newOrderIds;

                if (dragDebounceTimeout.current) {
                    clearTimeout(dragDebounceTimeout.current);
                }
                dragDebounceTimeout.current = setTimeout(() => {
                    axios.post(`${API_URL}/items/order`, { newOrder: lastOrderRef.current })
                        .catch(err => console.error("Error updating item order on server:", err));
                }, 1000);

                return newOrderedItems;
            });
        }
    };

    const handleSelectionChange = (itemId: number, isSelected: boolean) => {
        const newSelectedIds = new Set(selectedIds);

        if (isSelected) {
            newSelectedIds.add(itemId);
        } else {
            newSelectedIds.delete(itemId);
        }

        setSelectedIds(newSelectedIds);
        axios.post(`${API_URL}/items/selection`, { selectedIds: Array.from(newSelectedIds) })
            .catch(err => console.error("Error updating selection on server:", err));
    };

    const loadMoreItems = useCallback(() => {
        if (currentPage < totalPages && !isLoading) {
            const nextPage = currentPage + 1;

            fetchItems(nextPage, searchTerm, { preserveOrderAndSelection: true });
            setCurrentPage(nextPage);
        }
    }, [currentPage, totalPages, isLoading, fetchItems, searchTerm, setCurrentPage]);

    // Infinite scroll observer
    const observer = React.useRef<IntersectionObserver | null>(null);
    const lastItemElementRef = useCallback((node: HTMLLIElement | null) => {
        if (isLoading) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && currentPage < totalPages) {
                loadMoreItems();
            }
        });

        if (node) observer.current.observe(node);
    }, [isLoading, currentPage, totalPages, loadMoreItems]);


    return (
        <div className="sortable-table-container">
            <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
            />

            {isLoading && items.length === 0 && <p>Loading initial data...</p>}
            
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={items.map(item => item.id.toString())}
                    strategy={verticalListSortingStrategy}
                >
                    <ul className="items-list">
                        {items.map((itemData, index) => (
                            <ItemRow
                                key={itemData.id}
                                ref={index === items.length - 1 ? lastItemElementRef : null}
                                item={{
                                    ...itemData,
                                    isSelected: selectedIds.has(itemData.id)
                                }}
                                onSelectionChange={handleSelectionChange}
                            />
                        ))}
                    </ul>
                </SortableContext>
            </DndContext>

            {isLoading && items.length > 0 && <p>Loading more...</p>}
            {!isLoading && items.length === 0 && searchTerm && <p>No items found for "{searchTerm}".</p>}
            {!isLoading && items.length === 0 && !searchTerm && <p>No items to display.</p>}
        </div>
    );
};

export default SortableTable; 
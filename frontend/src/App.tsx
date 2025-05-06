import SortableTable from './components/SortableTable';
import './App.scss';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Sortable and Selectable List</h1>
      </header>
      <main>
        <SortableTable />
      </main>
    </div>
  );
}

export default App;

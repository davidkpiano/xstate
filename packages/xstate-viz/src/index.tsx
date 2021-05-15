import React, {
  useMemo,
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
} from 'react';
import ReactDOM from 'react-dom';
import { StateMachine, Interpreter, StateNode, State } from 'xstate';
import { useService } from '@xstate/react';
import styled from 'styled-components';

export function getChildren(machine: StateNode): StateNode[] {
  if (!machine.states) return [];

  return Object.keys(machine.states).map((key) => {
    return machine.states[key];
  });
}

export const MachineViz: React.FC<{
  machine: StateMachine<any, any, any>;
}> = ({ machine }) => {
  return (
    <div>
      <pre>{JSON.stringify(machine.initialState, null, 2)}</pre>
    </div>
  );
};

const StateContext = createContext<State<any, any>>({} as any);

const StyledStateNodeViz = styled.div`
  border: 1px solid black;
  margin-bottom: 1rem;
  display: inline-block;

  &[data-type='atomic'][data-active] {
    background: blue;
    color: white;
  }
`;

const StyledStateNodeChildrenViz = styled.div`
  display: grid;
  padding: 1rem;
  grid-column-gap: 1rem;
  grid-row-gap: 1rem;
  grid-template-columns: repeat(3, auto);
  grid-template-rows: auto;
`;

const StateNodeViz: React.FC<{
  stateNode: StateNode<any, any>;
}> = ({ stateNode }) => {
  const childNodes = useMemo(() => {
    return getChildren(stateNode);
  }, []);
  const state = useContext(StateContext);
  const active = state.configuration.includes(stateNode);

  return (
    <StyledStateNodeViz
      data-active={active || undefined}
      // data-type={stateNode.type}
    >
      <header>{stateNode.key}</header>
      <StyledStateNodeChildrenViz>
        {childNodes.map((childNode) => {
          return <StateNodeViz stateNode={childNode} key={childNode.id} />;
        })}
      </StyledStateNodeChildrenViz>
    </StyledStateNodeViz>
  );
};

export const ServiceViz: React.FC<{
  service: Interpreter<any, any>;
}> = ({ service }) => {
  const [state] = useService(service);

  console.log(state);

  return (
    <StateContext.Provider value={state}>
      <pre>{JSON.stringify(state, null, 2)}</pre>
      <StateNodeViz stateNode={service.machine} />
    </StateContext.Provider>
  );
};

export const ExtViz: React.FC = () => {
  const divRef = useRef(document.createElement('div'));
  const windowRef = useRef<Window | null>(null);
  console.log((window as any).__xstate__.services);
  const [[serviceSet], setServiceSet] = useState([
    (window as any).__xstate__.services as Set<Interpreter<any, any>>,
  ]);

  useEffect(() => {
    if (!windowRef.current) {
      windowRef.current = window.open(
        '',
        '',
        'width=600,height=400,left=200,top=200'
      );
      windowRef.current!.document.body.appendChild(divRef.current);
    }
  }, []);

  useEffect(() => {
    (window as any).__xstate__.onRegister(() => {
      console.log('well yeah');
      setServiceSet([(window as any).__xstate__.services]);
    });
  }, []);

  const services = (
    <>
      {Array.from(serviceSet).map((s) => {
        const serv = s as Interpreter<any, any>;

        console.log(serv.id);

        return (
          <>
            <ServiceViz key={serv.id} service={serv} />
          </>
        );
      })}
    </>
  );
  return ReactDOM.createPortal(services, divRef.current);
};

import { js2xml, Element as XMLElement, Attributes } from 'xml-js';
import {
  StateMachine,
  ActionObject,
  TransitionDefinition,
  StateNode,
  ActionType
} from 'xstate';
import { flatten } from 'xstate/lib/utils';

function cleanAttributes(attributes: Attributes): Attributes {
  for (const key of Object.keys(attributes)) {
    if (attributes[key] === undefined) {
      delete attributes[key];
    }
  }

  return attributes;
}

// tslint:disable-next-line:ban-types
export function functionToExpr(fn: Function): string {
  return fn.toString();
}

function actionToSCXML(action: ActionObject<any, any>): XMLElement {
  const { type, ...attributes } = action;

  const actionTypeMap: Record<ActionType, string> = {
    'xstate.raise': 'raise'
  };

  const name = actionTypeMap[action.type];

  if (name) {
    return {
      type: 'element',
      name,
      attributes
    };
  }

  return {
    type: 'element',
    name: 'script',
    elements: [
      {
        type: 'text',
        text: JSON.stringify(action)
      }
    ]
  };
}

export function transitionToSCXML(
  transition: TransitionDefinition<any, any>
): XMLElement {
  const elements = transition.actions.map(actionToSCXML);

  return {
    type: 'element',
    name: 'transition',
    attributes: cleanAttributes({
      event: transition.eventType,
      cond: transition.cond
        ? functionToExpr(transition.cond.predicate)
        : undefined,
      target: (transition.target || [])
        .map((stateNode) => stateNode.id)
        .join(' '),
      type: transition.internal ? 'internal' : undefined
    }),
    elements: elements.length ? elements : undefined
  };
}

function doneDataToSCXML(data: any): XMLElement {
  return {
    type: 'element',
    name: 'donedata',
    elements: [
      {
        type: 'element',
        name: 'content',
        attributes: {
          expr: JSON.stringify(data)
        }
      }
    ]
  };
}

function actionsToSCXML(
  name: 'onentry' | 'onexit',
  actions: Array<ActionObject<any, any>>
): XMLElement {
  return {
    type: 'element',
    name,
    elements: actions.map<XMLElement>((action) => {
      return actionToSCXML(action);
    })
  };
}

function stateNodeToSCXML(stateNode: StateNode<any, any, any>): XMLElement {
  const childStates = Object.keys(stateNode.states).map((key) => {
    const childStateNode = stateNode.states[key];

    return stateNodeToSCXML(childStateNode);
  });

  const elements: XMLElement[] = [];

  const { onEntry, onExit } = stateNode;

  if (onEntry.length) {
    elements.push(actionsToSCXML('onentry', onEntry));
  }

  if (onExit.length) {
    elements.push(actionsToSCXML('onexit', onExit));
  }

  const transitionElements = flatten(
    Object.keys(stateNode.on).map((event) => {
      const transitions = stateNode.on[event];

      return transitions!.map((transition) => transitionToSCXML(transition));
    })
  );

  elements.push(...transitionElements);
  elements.push(...childStates);

  if (stateNode.type === 'final' && stateNode.doneData) {
    elements.push(doneDataToSCXML(stateNode.doneData));
  }

  return {
    type: 'element',
    name:
      stateNode.type === 'parallel'
        ? 'parallel'
        : stateNode.type === 'final'
        ? 'final'
        : 'state',
    attributes: {
      id: stateNode.id,
      initial: stateNode.initial as string
    },
    elements
  };
}

export function toSCXML(machine: StateMachine<any, any, any>): string {
  const { states, initial } = machine;

  return js2xml(
    {
      elements: [
        {
          type: 'element',
          name: 'scxml',
          attributes: {
            xmlns: 'http://www.w3.org/2005/07/scxml',
            initial,
            // 'xmlns:xi': 'http://www.w3.org/2001/XInclude',
            version: '1.0',
            datamodel: 'ecmascript'
          },
          elements: Object.keys(states).map<XMLElement>((key) => {
            const stateNode = states[key];

            return stateNodeToSCXML(stateNode);
          })
        }
      ]
    },
    {
      spaces: 2
    }
  );
}

import { xml2js, Element as XMLElement } from 'xml-js';
import { EventObject, ActionObject, DefaultContext } from './types';
import { StateNode, Machine } from './index';
import { mapValues, keys, isString } from './utils';
import * as actions from './actions';

function getAttribute(
  element: XMLElement,
  attribute: string
): string | number | undefined {
  return element.attributes ? element.attributes[attribute] : undefined;
}

function indexedRecord<T extends {}>(
  items: T[],
  identifier: string | ((item: T) => string)
): Record<string, T> {
  const record: Record<string, T> = {};

  const identifierFn = isString(identifier)
    ? item => item[identifier]
    : identifier;

  items.forEach(item => {
    const key = identifierFn(item);

    record[key] = item;
  });

  return record;
}

function indexedAggregateRecord<T extends {}>(
  items: T[],
  identifier: string | ((item: T) => string)
): Record<string, T[]> {
  const record: Record<string, T[]> = {};

  const identifierFn = isString(identifier)
    ? item => item[identifier]
    : identifier;

  items.forEach(item => {
    const key = identifierFn(item);

    (record[key] = record[key] || ([] as T[])).push(item);
  });

  return record;
}

function executableContent(elements: XMLElement[]) {
  const transition: any = {
    actions: mapActions(elements)
  };

  return transition;
}

function getTargets(targetAttr?: string | number): string[] | undefined {
  // return targetAttr ? [`#${targetAttr}`] : undefined;
  return targetAttr
    ? `${targetAttr}`.split(/\s+/).map(target => `#${target}`)
    : undefined;
}

function mapActions<
  TContext extends DefaultContext,
  TEvent extends EventObject = EventObject
>(elements: XMLElement[]): Array<ActionObject<TContext, TEvent>> {
  return elements.map(element => {
    switch (element.name) {
      case 'raise':
        return actions.raise<TContext, TEvent>(element.attributes!
          .event! as string);
      case 'assign':
        return actions.assign<TContext, TEvent>(xs => {
          const literalKeyExprs = xs
            ? keys(xs)
                .map(key => `const ${key} = xs['${key}'];`)
                .join('\n')
            : '';
          const fnStr = `
          const xs = arguments[0];
          ${literalKeyExprs};
            return {'${element.attributes!.location}': ${
            element.attributes!.expr
          }};
          `;

          const fn = new Function(fnStr);
          return fn(xs);
        });
      case 'send':
        const delay = element.attributes!.delay!;
        const numberDelay = delay
          ? typeof delay === 'number'
            ? delay
            : /(\d+)ms/.test(delay)
            ? +/(\d+)ms/.exec(delay)![1]
            : 0
          : 0;
        return actions.send<TContext, TEvent>(
          element.attributes!.event! as string,
          {
            delay: numberDelay
          }
        );
      default:
        return { type: 'not-implemented' };
    }
  });
}

function toConfig(
  nodeJson: XMLElement,
  id: string,
  options: ScxmlToMachineOptions,
  extState?: {}
) {
  const { evalCond } = options;
  const parallel = nodeJson.name === 'parallel';
  let initial = parallel ? undefined : nodeJson.attributes!.initial;
  let states: Record<string, any>;
  let on: Record<string, any>;
  const { elements } = nodeJson;

  switch (nodeJson.name) {
    case 'history': {
      if (!elements) {
        return {
          id,
          history: nodeJson.attributes!.type || 'shallow'
        };
      }

      const [transitionElement] = elements.filter(
        element => element.name === 'transition'
      );

      const target = getAttribute(transitionElement, 'target');
      const history = getAttribute(nodeJson, 'type') || 'shallow';

      return {
        id,
        history,
        target: target ? `#${target}` : undefined
      };
    }
    case 'final': {
      return {
        ...nodeJson.attributes,
        type: 'final'
      };
    }
    default:
      break;
  }

  if (nodeJson.elements) {
    const stateElements = nodeJson.elements.filter(
      element =>
        element.name === 'state' ||
        element.name === 'parallel' ||
        element.name === 'final' ||
        element.name === 'history'
    );

    const transitionElements = nodeJson.elements.filter(
      element => element.name === 'transition'
    );

    const onEntryElement = nodeJson.elements.find(
      element => element.name === 'onentry'
    );

    const onExitElement = nodeJson.elements.find(
      element => element.name === 'onexit'
    );

    states = indexedRecord(stateElements, item => `${item.attributes!.id}`);

    const initialElement = !initial
      ? nodeJson.elements.find(element => element.name === 'initial')
      : undefined;

    if (initialElement && initialElement.elements!.length) {
      initial = initialElement.elements!.find(
        element => element.name === 'transition'
      )!.attributes!.target;
    } else if (!initialElement && stateElements.length) {
      initial = stateElements[0].attributes!.id;
    }

    on = mapValues(
      indexedAggregateRecord(
        transitionElements,
        item => (item.attributes ? item.attributes.event || '' : '') as string
      ),
      (values: XMLElement[]) => {
        return values.map(value => {
          const targets = getAttribute(value, 'target');
          const internal = getAttribute(value, 'type') === 'internal';

          return {
            target: getTargets(targets),
            ...(value.elements ? executableContent(value.elements) : undefined),
            ...(value.attributes && value.attributes.cond
              ? {
                  cond: evalCond(value.attributes.cond as string, extState)
                }
              : undefined),
            internal
          };
        });
      }
    );

    const onEntry = onEntryElement
      ? mapActions(onEntryElement.elements!)
      : undefined;

    const onExit = onExitElement
      ? mapActions(onExitElement.elements!)
      : undefined;

    return {
      id,
      ...(initial ? { initial } : undefined),
      ...(parallel ? { type: 'parallel' } : undefined),
      ...(stateElements.length
        ? {
            states: mapValues(states, (state, key) =>
              toConfig(state, key, options, extState)
            )
          }
        : undefined),
      ...(transitionElements.length ? { on } : undefined),
      ...(onEntry ? { onEntry } : undefined),
      ...(onExit ? { onExit } : undefined)
    };
  }

  return { id };
}

export interface ScxmlToMachineOptions {
  evalCond: (
    expr: string,
    extState?: object
  ) => // tslint:disable-next-line:ban-types
  ((extState: any, event: EventObject) => boolean) | Function;
  delimiter?: string;
}

export function toMachine(
  xml: string,
  options: ScxmlToMachineOptions
): StateNode {
  const json = xml2js(xml) as XMLElement;

  const machineElement = json.elements!.filter(
    element => element.name === 'scxml'
  )[0];

  const dataModelEl = machineElement.elements!.filter(
    element => element.name === 'datamodel'
  )[0];

  const extState = dataModelEl
    ? dataModelEl.elements!.reduce((acc, element) => {
        acc[element.attributes!.id!] = element.attributes!.expr
          ? // tslint:disable-next-line:no-eval
            eval(`(${element.attributes!.expr})`)
          : undefined;
        return acc;
      }, {})
    : undefined;

  return Machine(
    {
      ...toConfig(machineElement, '(machine)', options, extState),
      context: extState,
      delimiter: options.delimiter
    },
    undefined,
    extState
  );
}

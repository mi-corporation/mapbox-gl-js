// @flow

import { StringType, NumberType } from '../types';

import type { Expression } from '../expression';
import type EvaluationContext from '../evaluation_context';
import type ParsingContext from '../parsing_context';
import type { Type } from '../types';

declare var Intl: {
    NumberFormat: Class<Intl$NumberFormat>
};

declare class Intl$NumberFormat {
    constructor (
        locales?: string | string[],
        options?: NumberFormatOptions
    ): Intl$NumberFormat;

    static (
        locales?: string | string[],
        options?: NumberFormatOptions
    ): Intl$NumberFormat;

    format(a: number): string;

    resolvedOptions(): any;
}

type NumberFormatOptions = {
    style?: 'decimal' | 'currency' | 'percent';
    currency?: null | string;
};

export default class NumberFormat implements Expression {
    type: Type;
    number: Expression;
    style: Expression;
    locale: Expression | null;   // BCP 47 language tag
    currency: Expression | null; // ISO 4217 currency code, required if style=currency

    constructor(number: Expression, style: Expression, locale: Expression | null, currency: Expression | null) {
        this.type = StringType;
        this.number = number;
        this.style = style;
        this.locale = locale;
        this.currency = currency;
    }

    static parse(args: Array<mixed>, context: ParsingContext): ?Expression {
        if (args.length !== 3)
            return context.error(`Expected two arguments.`);

        const number = context.parse(args[1], 1, NumberType);
        if (!number) return null;

        const options = (args[2]: any);
        if (typeof options !== "object" || Array.isArray(options))
            return context.error(`NumberFormat options argument must be an object.`);

        const style = context.parse(
            options['style'] === undefined ? "decimal" : options['style'], 1, StringType);
        if (!style) return null;

        let locale = null;
        if (options['locale']) {
            locale = context.parse(options['locale'], 1, StringType);
            if (!locale) return null;
        }

        let currency = null;
        if (options['currency']) {
            currency = context.parse(options['currency'], 1, StringType);
            if (!currency) return null;
        }

        return new NumberFormat(number, style, locale, currency);
    }

    evaluate(ctx: EvaluationContext) {
        return new Intl.NumberFormat(this.locale ? this.locale.evaluate(ctx) : [],
            {
                style: this.style.evaluate(ctx),
                currency: this.currency ? this.currency.evaluate(ctx) : null
            }).format(this.number.evaluate(ctx));
    }

    eachChild(fn: (Expression) => void) {
        fn(this.number);
        fn(this.style);
        if (this.locale) {
            fn(this.locale);
        }
        if (this.currency) {
            fn(this.currency);
        }
    }

    possibleOutputs() {
        return [undefined];
    }

    serialize() {
        const options = {};
        options['style'] = this.style.serialize();
        if (this.locale) {
            options['locale'] = this.locale.serialize();
        }
        if (this.currency) {
            options['currency'] = this.currency.serialize();
        }
        return ["number-format", this.number.serialize(), options];
    }
}

"use strict"
import produce, {setUseProxies, applyPatches} from "../src/index"

jest.setTimeout(1000)

function runPatchTest(base, producer, patches, inversePathes) {
	let resultProxies, resultEs5

	function runPatchTestHelper() {
		let recordedPatches
		let recordedInversePatches
		const res = produce(base, producer, (p, i) => {
			recordedPatches = p
			recordedInversePatches = i
		})

		test("produces the correct patches", () => {
			expect(recordedPatches).toEqual(patches)
			if (inversePathes) expect(recordedInversePatches).toEqual(inversePathes)
		})

		test("patches are replayable", () => {
			expect(applyPatches(base, recordedPatches)).toEqual(res)
		})

		test("patches can be reversed", () => {
			expect(applyPatches(res, recordedInversePatches)).toEqual(base)
		})

		return res
	}

	describe(`proxy`, () => {
		setUseProxies(true)
		resultProxies = runPatchTestHelper()
	})

	describe(`es5`, () => {
		setUseProxies(false)
		resultEs5 = runPatchTestHelper()
		test("ES5 and Proxy implementation yield same result", () => {
			expect(resultEs5).toEqual(resultProxies)
		})
	})

	return resultProxies
}

describe("applyPatches", () => {
	it("mutates the base state when it is a draft", () => {
		produce({a: 1}, draft => {
			const result = applyPatches(draft, [
				{op: "replace", path: ["a"], value: 2}
			])
			expect(result).toBe(draft)
			expect(draft.a).toBe(2)
		})
	})
	it("produces a copy of the base state when not a draft", () => {
		const base = {a: 1}
		const result = applyPatches(base, [{op: "replace", path: ["a"], value: 2}])
		expect(result).not.toBe(base)
		expect(result.a).toBe(2)
		expect(base.a).toBe(1)
	})
	it('throws when `op` is not "add", "replace", nor "remove"', () => {
		expect(() => {
			const patch = {op: "copy", from: [0], path: [1]}
			applyPatches([2], [patch])
		}).toThrowErrorMatchingSnapshot()
	})
	it("throws when `path` cannot be resolved", () => {
		// missing parent
		expect(() => {
			const patch = {op: "add", path: ["a", "b"], value: 1}
			applyPatches({}, [patch])
		}).toThrowErrorMatchingSnapshot()

		// missing grand-parent
		expect(() => {
			const patch = {op: "add", path: ["a", "b", "c"], value: 1}
			applyPatches({}, [patch])
		}).toThrowErrorMatchingSnapshot()
	})
})

describe("simple assignment - 1", () => {
	runPatchTest(
		{x: 3},
		d => {
			d.x++
		},
		[{op: "replace", path: ["x"], value: 4}]
	)
})

describe("simple assignment - 2", () => {
	runPatchTest(
		{x: {y: 4}},
		d => {
			d.x.y++
		},
		[{op: "replace", path: ["x", "y"], value: 5}]
	)
})

describe("simple assignment - 3", () => {
	runPatchTest(
		{x: [{y: 4}]},
		d => {
			d.x[0].y++
		},
		[{op: "replace", path: ["x", 0, "y"], value: 5}]
	)
})

describe("delete 1", () => {
	runPatchTest(
		{x: {y: 4}},
		d => {
			delete d.x
		},
		[{op: "remove", path: ["x"]}]
	)
})

describe("renaming properties", () => {
	describe("nested object (no changes)", () => {
		runPatchTest(
			{a: {b: 1}},
			d => {
				d.x = d.a
				delete d.a
			},
			[{op: "add", path: ["x"], value: {b: 1}}, {op: "remove", path: ["a"]}]
		)
	})

	describe("nested object (with changes)", () => {
		runPatchTest(
			{a: {b: 1, c: 1}},
			d => {
				let a = d.a
				a.b = 2 // change
				delete a.c // delete
				a.y = 2 // add

				// rename
				d.x = a
				delete d.a
			},
			[
				{op: "add", path: ["x"], value: {b: 2, y: 2}},
				{op: "remove", path: ["a"]}
			]
		)
	})

	describe("deeply nested object (with changes)", () => {
		runPatchTest(
			{a: {b: {c: 1, d: 1}}},
			d => {
				let b = d.a.b
				b.c = 2 // change
				delete b.d // delete
				b.y = 2 // add

				// rename
				d.a.x = b
				delete d.a.b
			},
			[
				{op: "add", path: ["a", "x"], value: {c: 2, y: 2}},
				{op: "remove", path: ["a", "b"]}
			]
		)
	})
})

describe("minimum amount of changes", () => {
	runPatchTest(
		{x: 3, y: {a: 4}, z: 3},
		d => {
			d.y.a = 4
			d.y.b = 5
			Object.assign(d, {x: 4, y: {a: 2}})
		},
		[
			{op: "replace", path: ["x"], value: 4},
			{op: "replace", path: ["y"], value: {a: 2}}
		]
	)
})

describe("arrays - prepend", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.unshift(4)
		},
		[{op: "add", path: ["x", 0], value: 4}]
	)
})

describe("arrays - multiple prepend", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.unshift(4)
			d.x.unshift(5)
		},
		[
			{op: "add", path: ["x", 0], value: 5},
			{op: "add", path: ["x", 1], value: 4}
		]
	)
})

describe("arrays - splice middle", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.splice(1, 1)
		},
		[{op: "remove", path: ["x", 1]}]
	)
})

describe("arrays - multiple splice", () => {
	runPatchTest(
		[0, 1, 2, 3, 4, 5, 0],
		d => {
			d.splice(4, 2, 3)
			d.splice(1, 2, 3)
		},
		[
			{op: "replace", path: [1], value: 3},
			{op: "replace", path: [2], value: 3},
			{op: "remove", path: [5]},
			{op: "remove", path: [4]}
		]
	)
})

describe("arrays - modify and shrink", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x[0] = 4
			d.x.length = 2
		},
		[
			{op: "replace", path: ["x", 0], value: 4},
			{op: "replace", path: ["x", "length"], value: 2}
		]
	)
})

describe("arrays - prepend then splice middle", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.unshift(4)
			d.x.splice(2, 1)
		},
		[
			{op: "replace", path: ["x", 0], value: 4},
			{op: "replace", path: ["x", 1], value: 1}
		]
	)
})

describe("arrays - splice middle then prepend", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.splice(1, 1)
			d.x.unshift(4)
		},
		[
			{op: "replace", path: ["x", 0], value: 4},
			{op: "replace", path: ["x", 1], value: 1}
		]
	)
})

describe("arrays - truncate", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.length -= 2
		},
		[{op: "replace", path: ["x", "length"], value: 1}],
		[
			{op: "add", path: ["x", 1], value: 2},
			{op: "add", path: ["x", 2], value: 3}
		]
	)
})

describe("arrays - pop twice", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.pop()
			d.x.pop()
		},
		[{op: "replace", path: ["x", "length"], value: 1}]
	)
})

describe("arrays - push multiple", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.push(4, 5)
		},
		[
			{op: "add", path: ["x", 3], value: 4},
			{op: "add", path: ["x", 4], value: 5}
		],
		[{op: "replace", path: ["x", "length"], value: 3}]
	)
})

describe("arrays - splice (expand)", () => {
	runPatchTest(
		{x: [1, 2, 3]},
		d => {
			d.x.splice(1, 1, 4, 5, 6)
		},
		[
			{op: "replace", path: ["x", 1], value: 4},
			{op: "add", path: ["x", 2], value: 5},
			{op: "add", path: ["x", 3], value: 6}
		],
		[
			{op: "replace", path: ["x", 1], value: 2},
			{op: "remove", path: ["x", 3]},
			{op: "remove", path: ["x", 2]}
		]
	)
})

describe("arrays - splice (shrink)", () => {
	runPatchTest(
		{x: [1, 2, 3, 4, 5]},
		d => {
			d.x.splice(1, 3, 6)
		},
		[
			{op: "replace", path: ["x", 1], value: 6},
			{op: "remove", path: ["x", 3]},
			{op: "remove", path: ["x", 2]}
		],
		[
			{op: "replace", path: ["x", 1], value: 2},
			{op: "add", path: ["x", 2], value: 3},
			{op: "add", path: ["x", 3], value: 4}
		]
	)
})

describe("simple replacement", () => {
	runPatchTest({x: 3}, _d => 4, [{op: "replace", path: [], value: 4}])
})

describe("same value replacement - 1", () => {
	runPatchTest(
		{x: {y: 3}},
		d => {
			const a = d.x
			d.x = a
		},
		[]
	)
})

describe("same value replacement - 2", () => {
	runPatchTest(
		{x: {y: 3}},
		d => {
			const a = d.x
			d.x = 4
			d.x = a
		},
		[]
	)
})

describe("same value replacement - 3", () => {
	runPatchTest(
		{x: 3},
		d => {
			d.x = 3
		},
		[]
	)
})

describe("same value replacement - 4", () => {
	runPatchTest(
		{x: 3},
		d => {
			d.x = 4
			d.x = 3
		},
		[]
	)
})

describe("simple delete", () => {
	runPatchTest(
		{x: 2},
		d => {
			delete d.x
		},
		[
			{
				op: "remove",
				path: ["x"]
			}
		]
	)
})

describe("patch compressions yields correct results", () => {
	let p1, p2
	runPatchTest(
		{},
		d => {
			d.x = {test: true}
		},
		(p1 = [
			{
				op: "add",
				path: ["x"],
				value: {
					test: true
				}
			}
		])
	)
	runPatchTest(
		{x: {test: true}},
		d => {
			delete d.x
		},
		(p2 = [
			{
				op: "remove",
				path: ["x"]
			}
		])
	)
	const res = runPatchTest(
		{},
		d => {
			applyPatches(d, [...p1, ...p2])
		},
		[]
	)

	expect(res).toEqual({})
})

describe("change then delete property", () => {
	const res = runPatchTest(
		{
			x: 1
		},
		d => {
			d.x = 2
			delete d.x
		},
		[
			{
				op: "remove",
				path: ["x"]
			}
		]
	)
	test("valid result", () => {
		expect(res).toEqual({})
	})
})

test("replaying patches with interweaved replacements should work correctly", () => {
	const patches = []
	const s0 = {x: 1}

	const s1 = produce(
		s0,
		draft => {
			draft.x = 2
		},
		p => {
			patches.push(...p)
		}
	)

	const s2 = produce(
		s1,
		draft => {
			return {x: 0}
		},
		p => {
			patches.push(...p)
		}
	)

	const s3 = produce(
		s2,
		draft => {
			draft.x--
		},
		p => {
			patches.push(...p)
		}
	)

	expect(s3).toEqual({x: -1}) // correct result
	expect(applyPatches(s0, patches)).toEqual({x: -1}) // correct replay

	// manual replay on a draft should also be correct
	expect(
		produce(s0, draft => {
			return applyPatches(draft, patches)
		})
	).toEqual({x: -1})
})

"""Wraps a SKILL.md body as a DSPy module so GEPA can optimize it.

Ported from hermes-agent-self-evolution. The skill body is the optimizable
parameter; each forward pass runs the body as instructions over a task input
and returns the agent's response, which the fitness metric then scores.

(Loading / finding / reassembling cue skills lives in evolution.core.cue_skill;
this module is only the optimizable DSPy wrapper.)
"""

import dspy


class SkillModule(dspy.Module):
    """A DSPy module whose optimizable parameter is the skill body text."""

    class TaskWithSkill(dspy.Signature):
        """Complete a task following the provided skill instructions.

        You are an AI agent following specific skill instructions to complete a
        task. Read the skill instructions carefully and follow the procedure
        described.
        """

        skill_instructions: str = dspy.InputField(desc="The skill instructions to follow")
        task_input: str = dspy.InputField(desc="The task to complete")
        output: str = dspy.OutputField(desc="Your response following the skill instructions")

    def __init__(self, skill_text: str):
        super().__init__()
        self.skill_text = skill_text
        self.predictor = dspy.ChainOfThought(self.TaskWithSkill)

    def forward(self, task_input: str) -> dspy.Prediction:
        result = self.predictor(skill_instructions=self.skill_text, task_input=task_input)
        return dspy.Prediction(output=result.output)
